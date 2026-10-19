<h1 align="center">MUNDUS</h1>

<div align="center">

<p>A free, open source story-making suite made for writers, offering all the features you need to bring your story to life and always keep track of it.</p>

<p>Brainstorming your ideas by talking, writing down a draft, detailing a profile for each character, place everything on a map, all you need in one single app, synced between devices, no more jumping between programs and websites.</p>

<br>

<p>Mundus is divided into 6 "Modes", 4 for the active creation process and 2 for managing it:</p>

</div>

<br>

<p> 

Everything begins in the Atlas, where you can create, edit/delete and see all your projects (Each one is an independent Mundus)

  You can use the upload button in the top right to upload an individual Mundus' backup file, which you can create within

</p>

<img width="2560" height="1369" alt="MundusAtlas" src="https://github.com/user-attachments/assets/981dd335-7927-4dd8-af51-e332700c24b7" />

<br><br>

Opening a Mundus brings you to Writing Mode, where the magic happens, here you can find all the familiar features of a document editor, including:
- Quick button to see the scenes in the current folder or add a new one
- Auto format the active document to fix pagination errors
- Import / Export the active document to various formats
- A Dropdown menu to assign Draft / Review or Complete status to the active docuement
- A checkpoint system to easily save and restore a document without exiting the app, useful for trying out versions
- Auto save options with time instant / timed intervals or off options
- Focus mode to hide the top toolbar
- Zen mode to hide the entire UI, leaving you alone to focus on the text
- Support for uploaded custom Fonts and GoogleFonts, in the font selection menu (both sync when cloud is configured)
- Text colour and highlighting
- A dictionary to add custom words or names (The names of characters or Codex entries you create are automatically added!)
- Adding images to the document, resize and align them, including captions and an option to sync them online via free hosting
- Search and replace throughout the active document
- Speech-to-text via Whistle, fully local, useful for brainstorming sessions
- A spelling check, spelling review drawer with the list of errors in your document and an autocorrect engine based off Harper
- 


















<br><br><br><br><br><br><br><br><br><br><br><br><br>



MUNDUS INSTALLING & UPDATING GUIDE

AUTOMATIC SETUP VIA SCRIPT

EXTRACT THE ARCHIVE FILE DOWNLOADED FROM GITHUB AND OPEN THE EXTRACTED FOLDER BEFORE PROCEEDING, FOR ALL OSes

WINDOWS:
- Run prepare-app.bat and let it finish, it'll say "All done! You can press any key or close this window."

Congratulations, you are done, now to actually use the app, you have two options:

- In the folder you extracted you should now see two exe files, "Mundus-xxx-portable" and "Mundus-xxx-setup"
- The portable runs the app inside this folder and keeps all data here, you can move it around as you like
- The setup will install the app on the pc fully like others do, it'll store data in the default windows folders, create its own shortcut in the start menu etc

LINUX:
- Run prepare-app.sh and let it finish, it'll say "All done! You can press any key or close this window."

Congratulations, you are done, now to actually use the app, you have two options:

- In the folder you extracted you should now see two exe files, "Mundus-xxx.AppImage" and "mundus-app_xxx_amd64.deb"
- The AppImage runs the app inside this folder and keeps all data here, you can move it around as you like
- The deb will install the app on the pc fully like others do, it'll store data in the default system folders, create its own shortcut in the start menu etc. 

MACOS:
- Run prepare-app.sh and let it finish, it'll say "All done! You can press any key or close this window."

Congratulations, you are done, now to actually use the app, you have two options:

- In the folder you extracted you should now see two exe files, "Mundus-xxx-mac.zip" and "Mundus-xxx.dmg"
- The zip when extracted gives you the app bundle, you can run it from any folder and it'll keep inside all data here
- The dmg will give you the standard window where you drag the app icon into your Applications folder

ANDROID (BUILD APK):
- Open Android Studio
- Click "Open" and select the "android" folder inside this extracted Mundus folder
- Wait for Gradle indexing to complete
- In the top menu, click Build -> Build Bundle(s) / APK(s) -> Build APK(s)
- Click "locate" in the notification popup to find your generated app-debug.apk
- Transfer the .apk to your Android phone and install!


UPDATING MUNDUS

WINDOWS
- Download the new version's zip
- Repeat the setup process from above until you get the two exes
- Once you have the newer version portable.exe and setup.exe files, depending on which one you use currently
/ If you have the portable, move the newer version over to the older one's folder, delete the older version, you're done
/ If you have the fully installed version, run the newer setup.exe, select the option you chose when first installed (for user or for pc, it'll say at the bottom whether it detects a pre existing install or not), once the install is complete you are done

LINUX
- Download the new version's zip
- Repeat the setup process from above until you get the newer version AppImage and deb
- Once you have them, proceed depending on which one you use currently
/ If you have the AppImage, move the new version one where you have your current one, delete the old one, make the new one executable (Right-click it → Properties → Permissions → check "Allow executing file as program), you're done
/ If you have the fully installed version, double click the newer deb, click "upgrade" or "install" in the window that opens, you're done

MACOS
- Download the new version's zip
- Repeat the setup process from above until you get the newer version .zip and .dmg files
- Once you have them, proceed depending on which one you use currently
/ If you have the .zip, double click the newer version one to get the newer Mundus.app, move it (Mundus.app) to where you keep your current one version one, delete the old one, you're done
/ If you have the fully installed version, double click the newer .dmg, drag the Mundus icon into your Applications folder, click "replace", you're done
