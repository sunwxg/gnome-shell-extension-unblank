import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SCHEMA_NAME = 'org.gnome.shell.extensions.unblank';

function buildPrefsWidget(gsettings) {
    let page = new Adw.PreferencesPage();

    let acGroup = new Adw.PreferencesGroup({ title: 'AC Power' });
    page.add(acGroup);

    let isAcEnabled = gsettings.get_boolean('switch');
    let currentAcSeconds = gsettings.get_int('time');
    let isAcNever = currentAcSeconds === 0;
    let currentAcMinutes = isAcNever ? 5 : Math.floor(currentAcSeconds / 60);

    let acMasterRow = new Adw.ActionRow({ 
        title: 'Enable Custom Behavior',
        subtitle: 'Override the default system settings'
    });
    let acMasterSwitch = new Gtk.Switch({ active: isAcEnabled, valign: Gtk.Align.CENTER });
    
    acMasterRow.add_suffix(acMasterSwitch);
    acMasterRow.activatable_widget = acMasterSwitch;
    acGroup.add(acMasterRow);

    let neverAcRow = new Adw.ActionRow({ 
        title: 'Never Blank Screen',
        subtitle: 'Prevent the display from blanking automatically'
    });
    let neverAcSwitch = new Gtk.Switch({ active: isAcNever, valign: Gtk.Align.CENTER });
    
    neverAcRow.add_suffix(neverAcSwitch);
    neverAcRow.activatable_widget = neverAcSwitch;
    neverAcRow.set_sensitive(isAcEnabled);
    acGroup.add(neverAcRow);

    let timeAcRow = new Adw.ActionRow({ 
        title: 'Blanking Timeout',
        subtitle: 'Minutes to blank after locking the screen'
    });
    let timeAcSpin = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({ lower: 1, upper: 1440, step_increment: 1, value: currentAcMinutes }),
        numeric: true, climb_rate: 1.0, valign: Gtk.Align.CENTER
    });
    
    timeAcRow.add_suffix(timeAcSpin);
    timeAcRow.set_sensitive(isAcEnabled && !isAcNever);
    acGroup.add(timeAcRow);

    acMasterSwitch.connect('notify::active', (button) => {
        let active = button.active;
        gsettings.set_boolean('switch', active);
        neverAcRow.set_sensitive(active);
        timeAcRow.set_sensitive(active && !neverAcSwitch.get_active());
    });

    neverAcSwitch.connect('notify::active', (button) => {
        let active = button.active;
        timeAcRow.set_sensitive(acMasterSwitch.get_active() && !active);
        if (active) gsettings.set_int('time', 0);
        else gsettings.set_int('time', timeAcSpin.get_value_as_int() * 60);
    });

    timeAcSpin.connect('value-changed', (spin) => {
        if (!neverAcSwitch.get_active()) gsettings.set_int('time', spin.get_value_as_int() * 60);
    });

    let batGroup = new Adw.PreferencesGroup({ title: 'Battery Power' });
    page.add(batGroup);

    let isBatEnabled = gsettings.get_boolean('switch-battery'); 
    let currentBatSeconds = gsettings.get_int('time-battery');
    let isBatNever = currentBatSeconds === 0;
    let currentBatMinutes = isBatNever ? 5 : Math.floor(currentBatSeconds / 60);

    let batMasterRow = new Adw.ActionRow({ 
        title: 'Enable Custom Behavior',
        subtitle: 'Override the default system settings'
    });
    let batMasterSwitch = new Gtk.Switch({ active: isBatEnabled, valign: Gtk.Align.CENTER });
    
    batMasterRow.add_suffix(batMasterSwitch);
    batMasterRow.activatable_widget = batMasterSwitch;
    batGroup.add(batMasterRow);

    let neverBatRow = new Adw.ActionRow({ 
        title: 'Never Blank Screen',
        subtitle: 'Prevent the display from blanking automatically'
    });
    let neverBatSwitch = new Gtk.Switch({ active: isBatNever, valign: Gtk.Align.CENTER });

    neverBatRow.add_suffix(neverBatSwitch);
    neverBatRow.activatable_widget = neverBatSwitch;
    neverBatRow.set_sensitive(isBatEnabled);
    batGroup.add(neverBatRow);

    let timeBatRow = new Adw.ActionRow({ 
        title: 'Blanking Timeout',
        subtitle: 'Minutes to blank after locking the screen'
    });
    let timeBatSpin = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({ lower: 1, upper: 1440, step_increment: 1, value: currentBatMinutes }),
        numeric: true, climb_rate: 1.0, valign: Gtk.Align.CENTER
    });
    
    timeBatRow.add_suffix(timeBatSpin);
    timeBatRow.set_sensitive(isBatEnabled && !isBatNever);
    batGroup.add(timeBatRow);

    batMasterSwitch.connect('notify::active', (button) => { 
        let active = button.active;
        gsettings.set_boolean('switch-battery', active);
        neverBatRow.set_sensitive(active);
        timeBatRow.set_sensitive(active && !neverBatSwitch.get_active());
    });

    neverBatSwitch.connect('notify::active', (button) => {
        let active = button.active;
        timeBatRow.set_sensitive(batMasterSwitch.get_active() && !active);
        if (active) gsettings.set_int('time-battery', 0);
        else gsettings.set_int('time-battery', timeBatSpin.get_value_as_int() * 60);
    });

    timeBatSpin.connect('value-changed', (spin) => {
        if (!neverBatSwitch.get_active()) gsettings.set_int('time-battery', spin.get_value_as_int() * 60);
    });

    return page;
}

export default class UnblankPrefs extends ExtensionPreferences {
    getPreferencesWidget() {
        return buildPrefsWidget(this.getSettings());
    }
}
