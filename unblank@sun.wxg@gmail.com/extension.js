// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const Gio = imports.gi.Gio;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Gdk = imports.gi.Gdk;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;
const Tweener = imports.ui.tweener;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const ScreenShield = imports.ui.screenShield;

const SCHEMA_NAME = 'org.gnome.shell.extensions.unblank';
const MANUAL_FADE_TIME = 0.3;
const ARROW_IDLE_TIME = 30000; // ms
const STANDARD_FADE_TIME = 10;

const UPowerIface = '<node> \
<interface name="org.freedesktop.UPower"> \
    <property name="OnBattery" type="b" access="read"/> \
</interface> \
</node>';

const UPowerProxy = Gio.DBusProxy.makeProxyWrapper(UPowerIface);

const BUS_NAME = 'org.gnome.Mutter.DisplayConfig';
const OBJECT_PATH = '/org/gnome/Mutter/DisplayConfig';

const DisplayConfigIface = '<node> \
<interface name="org.gnome.Mutter.DisplayConfig"> \
    <property name="PowerSaveMode" type="i" access="readwrite"/> \
</interface> \
</node>';

const DisplayConfigProxy = Gio.DBusProxy.makeProxyWrapper(DisplayConfigIface);

class Unblank {
    constructor() {
        this.gsettings = Convenience.getSettings(SCHEMA_NAME);
        this.proxy = getProxy();

        this.setActiveOrigin = Main.screenShield._setActive;
        this.activateFadeOrigin = Main.screenShield._activateFade;
        this.resetLockScreenOrigin = Main.screenShield._resetLockScreen;
        this.startArrowAnimationOrigin = Main.screenShield._startArrowAnimation;
        this.pauseArrowAnimationOrigin = Main.screenShield._pauseArrowAnimation;
        this.stopArrowAnimationOrigin = Main.screenShield._stopArrowAnimation;
        this.liftShieldOrigin = Main.screenShield._liftShield;
        this.onUserBecameActiveOrigin = Main.screenShield._onUserBecameActive;

        this._pointerMoved = false;
        this.hideLightboxId = 0;

        this.powerProxy = new UPowerProxy(Gio.DBus.system,
            'org.freedesktop.UPower',
            '/org/freedesktop/UPower',
            (proxy, error) => {
                if (error) {
                    log(error.message);
                    return;
                }
                proxy.connect('g-properties-changed', this._onPowerChanged.bind(this));
                this._onPowerChanged();
            });

        this.connect_signal();
        this._switchChanged();
    }

    _switchChanged() {
        this.isUnblank = this.gsettings.get_boolean('switch');

        if (this.isUnblank) {
            Main.screenShield._setActive = _setActive;
            Main.screenShield._activateFade = _activateFade;
            Main.screenShield._resetLockScreen = _resetLockScreen;
            Main.screenShield._startArrowAnimation = _startArrowAnimation;
            Main.screenShield._pauseArrowAnimation = _pauseArrowAnimation;
            Main.screenShield._stopArrowAnimation = _stopArrowAnimation;
            Main.screenShield._liftShield = _liftShield;
            Main.screenShield._onUserBecameActive = _onUserBecameActive;
        } else {
            Main.screenShield._setActive = this.setActiveOrigin;
            Main.screenShield._activateFade = this.activateFadeOrigin;
            Main.screenShield._resetLockScreen = this.resetLockScreenOrigin;
            Main.screenShield._startArrowAnimation = this.startArrowAnimationOrigin;
            Main.screenShield._pauseArrowAnimation = this.pauseArrowAnimationOrigin;
            Main.screenShield._stopArrowAnimation = this.stopArrowAnimationOrigin;
            Main.screenShield._liftShield = this.liftShieldOrigin;
            Main.screenShield._onUserBecameActive = this.onUserBecameActiveOrigin;
        }
    }

    connect_signal() {
        this.signalPowerId = this.gsettings.connect("changed::switch", this._switchChanged.bind(this));
        this.signalSwitchId = this.gsettings.connect("changed::power", this._switchChanged.bind(this));
    }

    _onPowerChanged() {
        this.isOnBattery = (this.gsettings.get_boolean('power') && this.powerProxy.OnBattery);

        if (Main.screenShield._isActive) {
            if (this.isOnBattery)
                _turnOffMonitor();
            else
                _turnOnMonitor();
        }
    }
}

async function getProxy() {
    let proxy = new DisplayConfigProxy(Gio.DBus.session, BUS_NAME, OBJECT_PATH);
    return proxy;
}

function _setActive(active) {
    let prevIsActive = this._isActive;
    this._isActive = active;

    if (active && !this._pointerWatchId) {
        this._pointerWatchId = Mainloop.timeout_add(1000, _setPointerVisible.bind(this));
        GLib.Source.set_name_by_id(this._pointerWatchId, '[gnome-shell] this._setPointerVisible');
    }

    if (prevIsActive != this._isActive) {
        if (!unblank.isUnblank) {
            this.emit('active-changed');
        }
    }

    if (this._loginSession)
        this._loginSession.SetLockedHintRemote(active);

    this._syncInhibitor();
}

function _activateFade(lightbox, time) {
    Main.uiGroup.set_child_above_sibling(lightbox.actor, null);
    if (unblank.isUnblank && !this._isActive) {
        lightbox.show(time);
        unblank.hideLightboxId = Mainloop.timeout_add(STANDARD_FADE_TIME * 1000,
                                                      () => { lightbox.hide();
                                                              return GLib.SOURCE_REMOVE; });
    }

    if (this._becameActiveId == 0)
        this._becameActiveId = this.idleMonitor.add_user_active_watch(this._onUserBecameActive.bind(this))
}

function  _onUserBecameActive() {
    this.idleMonitor.remove_watch(this._becameActiveId);
    this._becameActiveId = 0;

    if (unblank.hideLightboxId != 0) {
        Mainloop.source_remove(unblank.hideLightboxId);
        unblank.hideLightboxId= 0;
    }

    if (this._isActive || this._isLocked) {
        this._longLightbox.hide();
        this._shortLightbox.hide();
    } else {
        this.deactivate(false);
    }

    let timer = unblank.gsettings.get_int('time');
    if (timer != 0 && this._turnOffMonitorId == 0) {
        this._turnOffMonitorId = Mainloop.timeout_add(20000, _turnOffMonitor.bind(this));
        GLib.Source.set_name_by_id(this._turnOffMonitorId, '[gnome-shell] this._turnOffMonitor');
    } else if (unblank.isOnBattery) {
        this._turnOffMonitorId = Mainloop.timeout_add(20000, _turnOffMonitor.bind(this));
        GLib.Source.set_name_by_id(this._turnOffMonitorId, '[gnome-shell] this._turnOffMonitor');
    }
}

function _resetLockScreen(params) {
    if (this._lockScreenState != MessageTray.State.HIDDEN)
        return;

    this._ensureLockScreen();
    this._lockDialogGroup.scale_x = 1;
    this._lockDialogGroup.scale_y = 1;

    this._lockScreenGroup.show();
    this._lockScreenState = MessageTray.State.SHOWING;

    let fadeToBlack;
    if (unblank.isUnblank) {
        fadeToBlack = false;
    } else {
        fadeToBlack = params.fadeToBlack;
    }

    if (params.animateLockScreen) {
        this._lockScreenGroup.y = -global.screen_height;
        Tweener.removeTweens(this._lockScreenGroup);
        Tweener.addTween(this._lockScreenGroup,
                         { y: 0,
                           time: MANUAL_FADE_TIME,
                           transition: 'easeOutQuad',
                           onComplete: function() {
                               this._lockScreenShown({ fadeToBlack: fadeToBlack,
                                                       animateFade: true });
                           },
                           onCompleteScope: this
                         });
    } else {
        this._lockScreenGroup.fixed_position_set = false;
        this._lockScreenShown({ fadeToBlack: fadeToBlack,
                                animateFade: false });
    }

    this._lockScreenGroup.grab_key_focus();

    if (Main.sessionMode.currentMode != 'lock-screen')
        Main.sessionMode.pushMode('lock-screen');
}

function _liftShield(onPrimary, velocity) {
    if (this._isLocked) {
        if (this._ensureUnlockDialog(onPrimary, true /* allowCancel */)) {
            this._hideLockScreen(true /* animate */, velocity);
            if (this._pointerWatchId) {
                Mainloop.source_remove(this._pointerWatchId);
                this._pointerWatchId= 0;
                unblank._pointerMoved = false;
            }
        }
    } else {
        this.deactivate(true /* animate */);
    }
}

function _startArrowAnimation() {
    this._arrowActiveWatchId = 0;
    this._arrowAnimationState = 1;
    if (this._turnOffMonitorId) {
        Mainloop.source_remove(this._turnOffMonitorId);
        this._turnOffMonitorId = 0;
    }
    _turnOnMonitor();

    if (!this._arrowAnimationId) {
        this._arrowAnimationId = Mainloop.timeout_add(6000, this._animateArrows.bind(this));
        GLib.Source.set_name_by_id(this._arrowAnimationId, '[gnome-shell] this._animateArrows');
        this._animateArrows();
    }

    if (!this._arrowWatchId)
        this._arrowWatchId = this.idleMonitor.add_idle_watch(ARROW_IDLE_TIME,
            this._pauseArrowAnimation.bind(this));
}

function _movePointer() {
    if (unblank._pointerMoved)
        return;

    let primary = Main.layoutManager.primaryMonitor;
    let display = Gdk.Display.get_default();
    let deviceManager = display.get_device_manager();
    let pointer = deviceManager.get_client_pointer();

    let [gdkScreen, x, y] = pointer.get_position();

    //pointer.warp(gdkScreen, primary.x + primary.width, primary.y + primary.height);
    unblank._pointerMoved = true;
}

function _setPointerVisible() {
    if (this._lockScreenState == MessageTray.State.SHOWN && this._arrowAnimationState == 0) {
        if (!this._motionId)
            this._motionId = global.stage.connect('captured-event', (stage, event) => {
                if (event.type() == Clutter.EventType.MOTION) {
                    this._cursorTracker.set_pointer_visible(true);
                    _movePointer();
                    global.stage.disconnect(this._motionId);
                    this._motionId = 0;
                }

                return Clutter.EVENT_PROPAGATE;
            });

        this._cursorTracker.set_pointer_visible(false);
        _movePointer();
    }

    return GLib.SOURCE_CONTINUE;
}

function _turnOnMonitor() {
    unblank.proxy.PowerSaveMode = 0;
}

function _turnOffMonitor() {
    unblank.proxy.PowerSaveMode = 1;

    this._turnOffMonitorId = 0;
    return GLib.SOURCE_REMOVE;
}

function _pauseArrowAnimation() {
    this._arrowAnimationState = 0;

    if (this._arrowAnimationId) {
        Mainloop.source_remove(this._arrowAnimationId);
        this._arrowAnimationId = 0;
    }

    let timer = unblank.gsettings.get_int('time');
    if (timer != 0 && !this._turnOffMonitorId) {
        this._turnOffMonitorId = Mainloop.timeout_add_seconds(timer, _turnOffMonitor.bind(this));
        GLib.Source.set_name_by_id(this._turnOffMonitorId, '[gnome-shell] this._turnOffMonitor');
    }

    if (!this._arrowActiveWatchId)
        this._arrowActiveWatchId = this.idleMonitor.add_user_active_watch(this._startArrowAnimation.bind(this));
}

function _stopArrowAnimation() {
    this._arrowAnimationState = 0;

    if (this._arrowAnimationId) {
        Mainloop.source_remove(this._arrowAnimationId);
        this._arrowAnimationId = 0;
    }
    if (this._arrowActiveWatchId) {
        this.idleMonitor.remove_watch(this._arrowActiveWatchId);
        this._arrowActiveWatchId = 0;
    }
    if (this._arrowWatchId) {
        this.idleMonitor.remove_watch(this._arrowWatchId);
        this._arrowWatchId = 0;
    }
    if (this._pointerWatchId) {
        Mainloop.source_remove(this._pointerWatchId);
        this._pointerWatchId= 0;
        unblank._pointerMoved = false;
    }
    if (this._turnOffMonitorId) {
        Mainloop.source_remove(this._turnOffMonitorId);
        this._turnOffMonitorId = 0;
    }
}

var unblank;

function init() {
    unblank = new Unblank();
}

function enable() {
}

function disable() {
}
