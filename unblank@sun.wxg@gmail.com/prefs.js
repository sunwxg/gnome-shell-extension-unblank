const Gtk = imports.gi.Gtk;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
let gsettings;

const SCHEMA_NAME = 'org.gnome.shell.extensions.unblank';

function init() {
    gsettings = ExtensionUtils.getSettings(SCHEMA_NAME);
}

function buildPrefsWidget() {
    let widget = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        margin_top: 10,
        margin_bottom: 10,
        margin_start: 10,
        margin_end: 10,
    });

    let vbox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        margin_top: 10
    });
    vbox.set_size_request(550, 350);

    hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 5 });
    let power_setting_label = new Gtk.Label({ label: "Only unblank when on AC",
        hexpand: true,
        xalign: 0 });
    let power_setting_switch = new Gtk.Switch({ active: gsettings.get_boolean('power') });

    power_setting_switch.connect('notify::active',
                   function (button) { gsettings.set_boolean('power', button.active); });

    hbox.append(power_setting_label);
    hbox.append(power_setting_switch);
    vbox.append(hbox);

    hbox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 5 });
    let timebox_label = new Gtk.Label({ label: "Timeout to blank after locking the screen",
        hexpand: true,
        xalign: 0 });
    let timebox_comboBox= new Gtk.ComboBoxText();
    timebox_comboBox.connect('changed',
                             (box) => { gsettings.set_int('time', Number(box.get_active_id())) });

    timebox_comboBox.append("0", "Never");
    timebox_comboBox.append("300", "5 minutes");
    timebox_comboBox.append("1800", "30 minutes");
    timebox_comboBox.append("3600", "60 minutes");
    timebox_comboBox.append("5400", "90 minutes");
    timebox_comboBox.append("7200", "120 minutes");

    timebox_comboBox.set_active_id(gsettings.get_int('time').toString());

    hbox.append(timebox_label);
    hbox.append(timebox_comboBox);
    vbox.append(hbox);

    widget.append(vbox);

    return widget;
}

function addBoldTextToBox(text, box) {
    let txt = new Gtk.Label({xalign: 0});
    txt.set_markup('<b>' + text + '</b>');
    txt.set_line_wrap(true);
    box.append(txt);
}
