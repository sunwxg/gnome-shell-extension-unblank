import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SCHEMA_NAME = 'org.gnome.shell.extensions.unblank';

function buildPrefsWidget(gsettings) {
    let page = new Adw.PreferencesPage();

    let group = new Adw.PreferencesGroup({
        title: 'Behavior',
    });
    page.add(group);

    let powerRow = new Adw.ActionRow({ 
        title: 'Only unblank on AC power',
        subtitle: 'Keep original behavior when using battery'
    });
    let powerSwitch = new Gtk.Switch({ 
        active: gsettings.get_boolean('power'), 
        valign: Gtk.Align.CENTER 
    });
    
    powerSwitch.connect('notify::active', (button) => { 
        gsettings.set_boolean('power', button.active); 
    });
    
    powerRow.add_suffix(powerSwitch);
    powerRow.activatable_widget = powerSwitch;
    group.add(powerRow);


    let currentSeconds = gsettings.get_int('time');
    let isNever = currentSeconds === 0;
    let currentMinutes = isNever ? 5 : Math.floor(currentSeconds / 60);

    let neverRow = new Adw.ActionRow({ 
        title: 'Never blank screen',
        subtitle: 'Disables the timeout completely'
    });
    let neverSwitch = new Gtk.Switch({ 
        active: isNever, 
        valign: Gtk.Align.CENTER 
    });
    
    neverRow.add_suffix(neverSwitch);
    neverRow.activatable_widget = neverSwitch;
    group.add(neverRow);

    let timeRow = new Adw.ActionRow({ 
        title: 'Timeout to blank',
        subtitle: 'Minutes after locking the screen'
    });
    
    let timeAdjustment = new Gtk.Adjustment({
        lower: 1,
        upper: 1440,
        step_increment: 1,
        value: currentMinutes
    });

    let timebox_spinButton = new Gtk.SpinButton({
        adjustment: timeAdjustment,
        numeric: true,
        climb_rate: 1.0,
        valign: Gtk.Align.CENTER,
        sensitive: !isNever
    });

    timeRow.add_suffix(timebox_spinButton);
    group.add(timeRow);

    neverSwitch.connect('notify::active', (button) => {
        let isNeverActive = button.active;
        timebox_spinButton.set_sensitive(!isNeverActive);
        
        if (isNeverActive) {
            gsettings.set_int('time', 0);
        } else {
            gsettings.set_int('time', timebox_spinButton.get_value_as_int() * 60);
        }
    });

    timebox_spinButton.connect('value-changed', (spin) => {
        if (!neverSwitch.get_active()) {
            gsettings.set_int('time', spin.get_value_as_int() * 60);
        }
    });

    return page;
}

export default class UnblankPrefs extends ExtensionPreferences {
    getPreferencesWidget() {
        return buildPrefsWidget(this.getSettings());
    }
}
