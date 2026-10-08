// OLED protection for the GNOME lock screen, modelled on what LG OLED TVs do:
//
//  * "Screen Shift": every few seconds the lock screen's content (clock,
//    notifications, menu buttons) glides to a new random spot a few pixels
//    away from its home position, so no pixel is lit in the same place for
//    long. The background is left alone, so nothing shows at the edges.
//  * "Logo luminance adjustment" (optional): the same content is shown at a
//    reduced opacity, which on an OLED panel directly lowers its light output.
//
// Shared by both lock-screen extensions in this folder; each one keeps an
// identical copy of this file next to its extension.js.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const GLIDE_TIME_MS = 2000;

export class OledShift {
    // settings: the extension's Gio.Settings. Keys used:
    //   oled-shift (b), oled-shift-radius (i px), oled-shift-interval (i s),
    //   and, when the schema has it, oled-content-opacity (i percent).
    constructor(settings) {
        this._settings = settings;
        this._timerId = 0;
        this._target = null;
        this._hasOpacityKey =
            settings.settings_schema.has_key('oled-content-opacity');
    }

    // The St.Widget that holds the clock, notifications and menu buttons.
    // The unlock dialog is rebuilt on every lock, so look it up each time.
    _lookupTarget() {
        const stack = Main.screenShield._dialog?._stack;
        return stack?.get_parent() ?? null;
    }

    _onPromptPage() {
        const dialog = Main.screenShield._dialog;
        return !!dialog && dialog._activePage === dialog._promptBox;
    }

    start() {
        this.stop();

        const target = this._lookupTarget();
        if (target)
            this._adopt(target);

        if (!this._settings.get_boolean('oled-shift'))
            return;

        this._step();
        const interval = this._settings.get_int('oled-shift-interval');
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._step();
            return GLib.SOURCE_CONTINUE;
        });
        GLib.Source.set_name_by_id(this._timerId, '[gnome-shell] OledShift step');
    }

    stop() {
        if (this._timerId !== 0) {
            GLib.Source.remove(this._timerId);
            this._timerId = 0;
        }
        this._release();
    }

    _release() {
        const target = this._target;
        this._target = null;
        if (!target)
            return;
        target.disconnectObject(this);
        target.remove_transition('translation-x');
        target.remove_transition('translation-y');
        target.set({translation_x: 0, translation_y: 0, opacity: 255});
    }

    // Take over a (possibly new) content container: the dialog may not exist
    // yet when start() runs, so this is done again on every step.
    _adopt(target) {
        if (this._target === target)
            return;
        this._release();
        this._target = target;
        // The shell destroys the dialog before it reports the unlock, so the
        // container may be gone by the time stop() runs: forget it then.
        target.connectObject('destroy', () => {
            this._target = null;
        }, this);
        if (!this._hasOpacityKey)
            return;
        const pct = this._settings.get_int('oled-content-opacity');
        target.opacity = Math.round(255 * pct / 100);
    }

    _step() {
        const target = this._lookupTarget();
        if (!target)
            return;
        this._adopt(target);

        let x = 0;
        let y = 0;
        if (!this._onPromptPage()) {
            // Uniform random point inside a disc of the configured radius,
            // in logical pixels (so it scales with the display scaling).
            const radius = this._settings.get_int('oled-shift-radius');
            const angle = Math.random() * 2 * Math.PI;
            const r = radius * Math.sqrt(Math.random());
            x = Math.round(r * Math.cos(angle));
            y = Math.round(r * Math.sin(angle));
        }

        target.remove_transition('translation-x');
        target.remove_transition('translation-y');
        target.ease({
            translation_x: x,
            translation_y: y,
            duration: GLIDE_TIME_MS,
            mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
        });
    }
}
