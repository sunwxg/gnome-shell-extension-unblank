
schemas:
	glib-compile-schemas unblank@sun.wxg@gmail.com/schemas/
submit: schemas
	cd unblank@sun.wxg@gmail.com/ && zip -r ~/unblank.zip *

install:
	rm -rf ~/.local/share/gnome-shell/extensions/unblank@sun.wxg@gmail.com
	mkdir -p ~/.local/share/gnome-shell/extensions/unblank@sun.wxg@gmail.com
	cp -r unblank@sun.wxg@gmail.com/* ~/.local/share/gnome-shell/extensions/unblank@sun.wxg@gmail.com/

