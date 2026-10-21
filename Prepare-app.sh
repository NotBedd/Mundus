#!/bin/bash

# Ensure the script pauses on exit so the user can read the output
pause_exit() {
    echo ""
    read -p "Press Enter to close this window..."
    exit $1
}

echo "==================================================="
echo "              MUNDUS - PREPARE APP                 "
echo "==================================================="
echo ""

# 0. Check if package.json exists in script directory
if [ ! -f "package.json" ]; then
    echo "[ERROR] package.json was not found in: $(pwd)"
    echo ""
    echo "IMPORTANT: If you opened this file directly from inside a ZIP archive,"
    echo "please EXTRACT all files from the ZIP into a regular folder first,"
    echo "then run Prepare-app.sh from the extracted folder!"
    echo ""
    pause_exit 1
fi

# 1. Check if Node.js is installed, if not, attempt automatic installation
if ! command -v node &> /dev/null; then
    echo "[NOTICE] Node.js was not detected on your system."
    echo "Attempting to automatically install Node.js and npm..."
    echo ""

    if command -v dnf &> /dev/null; then
        echo "Detected Fedora/RHEL-based system. Using dnf..."
        sudo dnf install -y nodejs npm
    elif command -v apt-get &> /dev/null; then
        echo "Detected Debian/Ubuntu-based system. Using apt..."
        sudo apt-get update && sudo apt-get install -y nodejs npm
    elif command -v pacman &> /dev/null; then
        echo "Detected Arch-based system. Using pacman..."
        sudo pacman -S --noconfirm nodejs npm
    elif command -v zypper &> /dev/null; then
        echo "Detected openSUSE system. Using zypper..."
        sudo zypper install -y nodejs npm
    else
        echo "[ERROR] Could not detect your Linux distribution's package manager."
        echo "Please install Node.js (v18 or higher) and npm manually from:"
        echo "https://nodejs.org/"
        pause_exit 1
    fi

    if ! command -v node &> /dev/null; then
        echo ""
        echo "[ERROR] Node.js installation failed or was cancelled."
        pause_exit 1
    fi
    echo ""
fi

echo "Node.js detected: $(node -v)"
echo "NPM detected: $(npm -v)"
echo ""

# 2. Check and install system packaging tools required for .deb and .rpm builds
echo "Checking for required system packaging tools..."
MISSING_TOOLS=0
command -v fakeroot &> /dev/null || MISSING_TOOLS=1
command -v dpkg &> /dev/null || MISSING_TOOLS=1
command -v rpmbuild &> /dev/null || MISSING_TOOLS=1

if [ $MISSING_TOOLS -eq 1 ]; then
    echo "[NOTICE] Missing packaging tools. Attempting to install them automatically..."
    
    if command -v dnf &> /dev/null; then
        echo "Installing fakeroot, dpkg, rpm-build, and libxcrypt-compat..."
        sudo dnf install -y fakeroot dpkg rpm-build libxcrypt-compat
    elif command -v apt-get &> /dev/null; then
        echo "Installing fakeroot, dpkg, and rpm..."
        sudo apt-get update && sudo apt-get install -y fakeroot dpkg rpm
    elif command -v pacman &> /dev/null; then
        echo "Installing fakeroot, dpkg, and rpm-tools..."
        sudo pacman -S --noconfirm fakeroot dpkg rpm-tools
    elif command -v zypper &> /dev/null; then
        echo "Installing fakeroot, dpkg, and rpm-build..."
        sudo zypper install -y fakeroot dpkg rpm-build
    fi
else
    echo "All packaging tools are already installed."
fi

echo ""

# 3. Install dependencies if not already installed
export NODE_NO_WARNINGS=1

if [ ! -d "node_modules" ]; then
    echo "Installing project dependencies..."
    npm install --no-fund --no-audit --loglevel=error
else
    echo "Dependencies already present in node_modules."
fi

echo ""
echo "Building desktop application..."
npm run electron:build

if [ $? -ne 0 ]; then
    echo ""
    echo "[ERROR] The build command failed. Check the output above for details."
    pause_exit 1
fi

# Verify that executables were generated before proceeding to cleanup
shopt -s nullglob
release_files=(release/*.AppImage release/*.deb release/*.rpm release/*.tar.gz release/*.zip)

if [ ${#release_files[@]} -eq 0 ]; then
    echo ""
    echo "[ERROR] No executables were found in the release directory. Build may have failed."
    pause_exit 1
fi

echo ""
echo "[CLEANUP] Moving standalone application files to root folder..."
mv "${release_files[@]}" ./ 2>/dev/null || true

echo "[CLEANUP] Purging all temporary build directories and development source files..."
rm -rf release dist dist-electron node_modules src electron 2>/dev/null || true
rm -f package.json package-lock.json bun.lock tsconfig.json vite.config.ts electron-builder.json index.html metadata.json firestore.rules firebase-blueprint.json .gitignore .env.example Prepare-app.bat Run-Prepare.cmd 2>/dev/null || true

echo "[CLEANUP] Cleanup completed! Only your standalone executables and README remain."

echo ""
echo "==================================================="
echo "              PREPARATION COMPLETED!               "
echo "==================================================="
echo "Executables generated right here in this folder:"
ls -lh *.AppImage *.deb *.rpm *.tar.gz *.zip 2>/dev/null || true
echo ""
echo "All development files have been cleaned. Only your executables and"
echo "README-ELECTRON.md remain!"
echo ""

# Self-delete the script
rm -- "$0" 2>/dev/null || true

# Pause at the end so the user can see the results
read -p "All done! Press Enter to close this window..."