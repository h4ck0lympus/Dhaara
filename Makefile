# Builds the Linux Electron binary: release/out/Dhara-<version>-x86_64.AppImage (x86_64, Node 22).
.PHONY: appimage clean

appimage:
	bash release/build.sh

clean:
	rm -rf release/out
