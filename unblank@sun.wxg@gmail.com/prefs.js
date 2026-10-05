import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SHIFT_INTERVAL_OPTIONS = [
    [30, '30 seconds'],
    [60, '1 minute'],
    [120, '2 minutes'],
    [300, '5 minutes'],
];

const TIME_OPTIONS = [
    [0, 'Never'],
    [300, '5 minutes'],
    [600, '10 minutes'],
    [900, '15 minutes'],
    [1800, '30 minutes'],
    [3600, '60 minutes'],
    [5400, '90 minutes'],
    [7200, '120 minutes'],
];

export default class UnblankPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup();
        page.add(group);

        const powerRow = new Adw.SwitchRow({ title: 'Only unblank when on AC' });
        settings.bind('power', powerRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(powerRow);

        const timeRow = new Adw.ComboRow({
            title: 'Timeout to blank after locking the screen',
            model: Gtk.StringList.new(TIME_OPTIONS.map(([, label]) => label)),
        });
        const saved = settings.get_int('time');
        const index = TIME_OPTIONS.findIndex(([value]) => value === saved);
        timeRow.selected = index >= 0 ? index : 0;
        timeRow.connect('notify::selected',
            () => settings.set_int('time', TIME_OPTIONS[timeRow.selected][0]));
        group.add(timeRow);

        const oledGroup = new Adw.PreferencesGroup({
            title: 'OLED protection',
            description: 'Moves the clock, date and notifications a little at every interval, like the Screen Shift feature of OLED TVs',
        });
        page.add(oledGroup);

        const shiftRow = new Adw.SwitchRow({ title: 'Shift lock screen content' });
        settings.bind('oled-shift', shiftRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        oledGroup.add(shiftRow);

        const radiusRow = new Adw.SpinRow({
            title: 'Shift distance (pixels)',
            adjustment: new Gtk.Adjustment({ lower: 1, upper: 60, step_increment: 1, page_increment: 5 }),
        });
        settings.bind('oled-shift-radius', radiusRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        oledGroup.add(radiusRow);

        const intervalRow = new Adw.ComboRow({
            title: 'Shift interval',
            model: Gtk.StringList.new(SHIFT_INTERVAL_OPTIONS.map(([, label]) => label)),
        });
        const savedInterval = settings.get_int('oled-shift-interval');
        const intervalIndex = SHIFT_INTERVAL_OPTIONS.findIndex(([value]) => value === savedInterval);
        intervalRow.selected = intervalIndex >= 0 ? intervalIndex : 1;
        intervalRow.connect('notify::selected',
            () => settings.set_int('oled-shift-interval', SHIFT_INTERVAL_OPTIONS[intervalRow.selected][0]));
        oledGroup.add(intervalRow);

        window.add(page);
    }
}
