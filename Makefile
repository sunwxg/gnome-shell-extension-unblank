ifeq ($(strip $(DESTDIR)),)
	INSTALL_TYPE=local
	INSTALLBASE=$(HOME)/.local/share/gnome-shell/extensions
else
	INSTALL_TYPE=system
	SHARE_PREFIX=$(DESTDIR)/usr/share
	INSTALLBASE=$(SHARE_PREFIX)/gnome-shell/extensions
endif
INSTALLNAME=unblank@sun.wxg@gmail.com
GSCHEMA_FILE=org.gnome.shell.extensions.unblank.gschema.xml

schemas:
	glib-compile-schemas $(INSTALLNAME)/schemas/
submit: schemas
	cd $(INSTALLNAME)/ && zip -r ~/unblank.zip *

install:
	rm -rf $(INSTALLBASE)/$(INSTALLNAME) $(SHARE_PREFIX)/glib-2.0/schemas/$(GSCHEMA_FILE)
	mkdir -p $(INSTALLBASE)/$(INSTALLNAME)
	cp -r $(INSTALLNAME)/* $(INSTALLBASE)/$(INSTALLNAME)/
ifeq ($(INSTALL_TYPE),system)
	mkdir -p $(SHARE_PREFIX)/glib-2.0/schemas
	cp -r $(INSTALLBASE)/$(INSTALLNAME)/schemas/$(GSCHEMA_FILE) $(SHARE_PREFIX)/glib-2.0/schemas
	rm -rf $(INSTALLBASE)/$(INSTALLNAME)/schemas
endif