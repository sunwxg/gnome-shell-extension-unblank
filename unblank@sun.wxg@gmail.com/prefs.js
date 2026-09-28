import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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

        window.add(page);
    }
}
