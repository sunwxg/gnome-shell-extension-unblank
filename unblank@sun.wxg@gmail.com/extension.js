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

var MANUAL_FADE_TIME = 0.3;

const UPowerIface = '<node> \
<interface name="org.freedesktop.UPower"> \
    <property name="OnBattery" type="b" access="read"/> \
</interface> \
</node>';

const UPowerProxy = Gio.DBusProxy.makeProxyWrapper(UPowerIface);

function _setActive(active) {
    let prevIsActive = this._isActive;
    this._isActive = active;

    print("wxg: setActive");
    print("wxg: onBattery=", powerProxy.OnBattery);
    if (prevIsActive != this._isActive) {
        if (powerProxy.OnBattery)
            this.emit('active-changed');
    }

    if (this._loginSession)
        this._loginSession.SetLockedHintRemote(active);

    this._syncInhibitor();
}

function _activateFade(lightbox, time) {
    print("wxg: activateFade");
    Main.uiGroup.set_child_above_sibling(lightbox.actor, null);
    if (lightbox != this._longLightbox) {
        print("wxg: shortLightbox show");
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

    //wxg
    print("wxg: resetLockScreen");
    let fadeToBlack;
    if (powerProxy.OnBattery) {
        fadeToBlack = params.fadeToBlack;
    } else {
        fadeToBlack = false;
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

function sync() {
    //print("wxg: onBattery=", powerProxy.OnBattery);
    //print("wxg: active=", Main.screenShield._isActive);
    //if (Main.screenShield._isActive && powerProxy.OnBattery) {
    //    Main.screenShield.emit('active-changed');
    //}
    print("wxg: _sync");
}

let setActiveOrigin;
let activateFadeOrigin;
let resetLockScreenOrigin;

let powerProxy;

function init() {
    setActiveOrigin = ScreenShield.ScreenShield._setActive;
    activateFadeOrigin = ScreenShield.ScreenShield._activateFade;
    resetLockScreenOrigin = ScreenShield.ScreenShield._resetLockScreen;
        
    Main.screenShield._setActive = _setActive;
    Main.screenShield._activateFade = _activateFade;
    Main.screenShield._resetLockScreen = _resetLockScreen;

    powerProxy = new UPowerProxy(Gio.DBus.system,
                                   'org.freedesktop.UPower',
                                   '/org/freedesktop/UPower',
                                   (proxy, error) => {
                                       if (error) {
                                           log(error.message);
                                           return;
                                       }
                                       powerProxy.connect('g-properties-changed', () => sync());
                                       sync();
                                   });
    print("wxg: init");
}

function enable() {
    print("wxg: enable");
}

function disable() {
    print("wxg: disable");
}
