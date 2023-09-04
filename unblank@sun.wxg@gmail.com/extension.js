// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-
//
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk';
import St from 'gi://St';
import UPower from 'gi://UPowerGlib';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as Overview from 'resource:///org/gnome/shell/ui/overview.js';
import { loadInterfaceXML } from 'resource:///org/gnome/shell/misc/fileUtils.js';


const MANUAL_FADE_TIME = 0.3;
const STANDARD_FADE_TIME = 10;

const UPOWER_BUS_NAME = 'org.freedesktop.UPower';
const UPOWER_OBJECT_PATH = '/org/freedesktop/UPower/devices/DisplayDevice';
const DisplayDeviceInterface = loadInterfaceXML('org.freedesktop.UPower.Device');
const PowerManagerProxy = Gio.DBusProxy.makeProxyWrapper(DisplayDeviceInterface);

const UPowerIface = loadInterfaceXML('org.freedesktop.UPower');
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
    constructor(settings) {
        this.gsettings = settings;
        this.proxy = new DisplayConfigProxy(Gio.DBus.session, BUS_NAME, OBJECT_PATH, () => {});

        this.setActiveOrigin = Main.screenShield._setActive;
        this.activateFadeOrigin = Main.screenShield._activateFade;
        this.resetLockScreenOrigin = Main.screenShield._resetLockScreen;
        this.onUserBecameActiveOrigin = Main.screenShield._onUserBecameActive;

        this._pointerMoved = false;
        this.hideLightboxId = 0;
        this._turnOffMonitorId = 0;
        this.inLock = false;
        this._activeOnce = false;
        this.enabled = false;

        //this.powerProxy = new PowerManagerProxy(Gio.DBus.system, UPOWER_BUS_NAME, UPOWER_OBJECT_PATH,
        this.powerProxy = new UPowerProxy(Gio.DBus.system,
                                           'org.freedesktop.UPower',
                                           '/org/freedesktop/UPower',
                                                (proxy, error) => {
                                                    if (error) {
                                                        log(error.message);
                                                        return;
                                                    }
                                                    this.powerProxy.connect('g-properties-changed',
                                                                            this._onPowerChanged.bind(this));
                                                    this._onPowerChanged(); });
    }

    enable() {
        Main.screenShield._setActive = _setActive;
        Main.screenShield._activateFade = _activateFade;
        Main.screenShield._resetLockScreen = _resetLockScreen;
        Main.screenShield._onUserBecameActive = _onUserBecameActive;
        this.enabled = true;
    }

    disable() {
        Main.screenShield._setActive = this.setActiveOrigin;
        Main.screenShield._activateFade = this.activateFadeOrigin;
        Main.screenShield._resetLockScreen = this.resetLockScreenOrigin;
        Main.screenShield._onUserBecameActive = this.onUserBecameActiveOrigin;
        this.enabled = false;
    }

    isUnblank() {
        this.isOnBattery = (this.gsettings.get_boolean('power') && this.powerProxy.OnBattery);
        return !this.isOnBattery;
    }

    _onPowerChanged() {
        this.isOnBattery = (this.gsettings.get_boolean('power') && this.powerProxy.OnBattery);

        if (Main.screenShield._isActive) {
            if (this.isOnBattery) {
                Main.screenShield.emit('active-changed');
                Main.screenShield.activate(false);
                this._activeOnce = true;
                //_turnOffMonitor();
            } else
                _turnOnMonitor();
        }
    }
}

function _setActive(active) {
    let prevIsActive = this._isActive;
    this._isActive = active;
    unblank.inLock = active;

    if (prevIsActive != this._isActive) {
        if (!unblank.isUnblank() || unblank._activeOnce) {
            this.emit('active-changed');
            unblank._activeOnce = false;
        }
    }
    if (active) {
        _activateTimer();
    } else {
        _deactiveTimer();
    }

    if (this._loginSession)
        this._loginSession.SetLockedHintRemote(active);

    this._syncInhibitor();
}

function _activateFade(lightbox, time) {
    if (unblank.inLock) {
        _activateTimer();
        return;
    }

    Main.uiGroup.set_child_above_sibling(lightbox, null);
    if (unblank.isUnblank() && !this._isActive) {
        lightbox.lightOn(time);
        unblank.hideLightboxId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, time + 1000,
                                                      () => { lightbox.lightOff();
                                                              _activateTimer();
                                                              unblank.hideLightboxId = 0;
                                                              return GLib.SOURCE_REMOVE; });
    } else {
        lightbox.lightOn(time);
    }

    if (this._becameActiveId == 0)
        this._becameActiveId = this.idleMonitor.add_user_active_watch(this._onUserBecameActive.bind(this))
}

function  _onUserBecameActive() {
    if (this._becameActiveId != 0) {
        this.idleMonitor.remove_watch(this._becameActiveId);
        this._becameActiveId = 0;
    }

    if (unblank.hideLightboxId != 0) {
        GLib.source_remove(unblank.hideLightboxId);
        unblank.hideLightboxId= 0;
    }
    //_deactiveTimer();
    //_turnOnMonitor();

    if (this._isActive || this._isLocked) {
        this._longLightbox.lightOff();
        this._shortLightbox.lightOff();
    } else {
        this.deactivate(false);
    }
}

function _resetLockScreen(params) {
    _activateTimer();
    if (this._lockScreenState != MessageTray.State.HIDDEN)
        return;

    this._lockScreenGroup.show();
    this._lockScreenState = MessageTray.State.SHOWING;

    let fadeToBlack;
    if (unblank.isUnblank()) {
        fadeToBlack = false;
    } else {
        fadeToBlack = params.fadeToBlack;
    }

    if (params.animateLockScreen) {
        this._lockDialogGroup.translation_y = -global.screen_height;
        this._lockDialogGroup.remove_all_transitions();
        this._lockDialogGroup.ease({
            translation_y: 0,
            duration: Overview.ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this._lockScreenShown({ fadeToBlack, animateFade: true });
            },
        });
    } else {
        this._lockDialogGroup.translation_y = 0;
        this._lockScreenShown({ fadeToBlack, animateFade: false });
    }

    this._dialog.grab_key_focus();
}

function _changeToBlank() {
    if (!unblank._activeOnce) {
        Main.screenShield.emit('active-changed');
        unblank._activeOnce = true;
    }
}

function _activateTimer() {
    _deactiveTimer();
    let timer = unblank.gsettings.get_int('time');
    if (timer != 0) {
        unblank._turnOffMonitorId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, timer, () => {
            _changeToBlank();
            //_turnOffMonitor();
            unblank._turnOffMonitorId = 0;
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(unblank._turnOffMonitorId, '[gnome-shell] this._turnOffMonitor');
    }
}

function _deactiveTimer() {
    if (unblank._turnOffMonitorId != 0) {
        GLib.source_remove(unblank._turnOffMonitorId);
        unblank._turnOffMonitorId = 0;
    }
}

function _turnOnMonitor() {
    unblank.proxy.PowerSaveMode = 0;
}

function _turnOffMonitor() {
    unblank.proxy.PowerSaveMode = 1;
}

var unblank = null;
var enabled = false;

export default class PanelScrollExtension extends Extension {
    constructor(metadata) {
        super(metadata);
    }

    enable() {
        this._settings = this.getSettings();

        if (enabled)
            return;
        unblank = new Unblank(this._settings);
        unblank.enable();
        enabled = true;

    }

    disable() {
        if (!Main.sessionMode.isLocked) {
            unblank.disable();
            unblank = null
            enabled = false;
            this._settings = null;
        }
    }
}
