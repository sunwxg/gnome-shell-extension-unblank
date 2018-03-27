// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const Gio = imports.gi.Gio;
const St = imports.gi.St;
const Mainloop = imports.mainloop;

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

const UPowerIface = '<node> \
<interface name="org.freedesktop.UPower"> \
    <property name="OnBattery" type="b" access="read"/> \
</interface> \
</node>';

const UPowerProxy = Gio.DBusProxy.makeProxyWrapper(UPowerIface);

class Unblank {
    constructor() {
        this.gsettings = Convenience.getSettings(SCHEMA_NAME);

        this.setActiveOrigin = Main.screenShield._setActive;
        this.activateFadeOrigin = Main.screenShield._activateFade;
        this.resetLockScreenOrigin = Main.screenShield._resetLockScreen;

        this.connect_signal();
        this._switchChanged();

        this.powerProxy = new UPowerProxy(Gio.DBus.system,
                                'org.freedesktop.UPower',
                                '/org/freedesktop/UPower',
                                (proxy, error) => {
                                    if (error) {
                                        log(error.message);
                                        return;
                                    }
                                    this.powerProxy.connect('g-properties-changed', () => this.sync());
                                    this.sync();
                                });
    }

    _switchChanged() {
        this.isUnblank = this.gsettings.get_boolean('switch');
        if (this.isUnblank) {
            Main.screenShield._setActive = _setActive;
            Main.screenShield._activateFade = _activateFade;
            Main.screenShield._resetLockScreen = _resetLockScreen;
        } else {
            Main.screenShield._setActive = this.setActiveOrigin;
            Main.screenShield._activateFade = this.activateFadeOrigin;
            Main.screenShield._resetLockScreen = this.resetLockScreenOrigin;
        }
    }

    connect_signal() {
        this.signalSwitchId = this.gsettings.connect("changed::switch", this._switchChanged.bind(this));
    }

    sync() {
        //if (Main.screenShield._isActive && powerProxy.OnBattery) {
        //    Main.screenShield.emit('active-changed');
        //}
    }
}

function _setActive(active) {
    let prevIsActive = this._isActive;
    this._isActive = active;

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
    if (unblank.isUnblank) {
        if (lightbox != this._longLightbox)
            lightbox.show(time);
    } else {
        lightbox.show(time);
    }

    if (this._becameActiveId == 0)
        this._becameActiveId = this.idleMonitor.add_user_active_watch(this._onUserBecameActive.bind(this))
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

let unblank;

function init() {
    unblank = new Unblank();
}

function enable() {
}

function disable() {
}
