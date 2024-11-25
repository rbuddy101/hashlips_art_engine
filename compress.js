const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Source and destination directories
const srcDir = path.join(__dirname, 'layers');
const destDir = path.join(__dirname, 'comp_layers');

// Function to copy directories recursively
function copyDirectories(src, dest) {
    if (!fs.existsSync(dest)){
        fs.mkdirSync(dest, { recursive: true });
    }

    fs.readdirSync(src).forEach(item => {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);
        const stats = fs.statSync(srcPath);

        if (stats.isDirectory()) {
            copyDirectories(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
}

// Function to compress images to 200x200px
async function compressImages(directory) {
    const files = fs.readdirSync(directory);
    const rarityDelimiter = '#';

    for (const file of files) {
        const filePath = path.join(directory, file);
        const stats = fs.statSync(filePath);

        if (stats.isDirectory()) {
            await compressImages(filePath);
        } else {
            const ext = path.extname(file).toLowerCase();
            if (['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.gif', '.svg'].includes(ext)) {
                try {
                    const baseName = path.basename(file, ext);
                    const cleanName = baseName.split(rarityDelimiter)[0];
                    const newFilePath = path.join(directory, cleanName + ext);

                    await sharp(filePath)
                        .resize(200, 200)
                        .toFile(filePath + '.tmp');

                    fs.unlinkSync(filePath);
                    fs.renameSync(filePath + '.tmp', newFilePath);

                    console.log(`Compressed: ${newFilePath}`);
                } catch (error) {
                    console.error(`Error compressing ${filePath}:`, error);
                }
            }
        }
    }
}

// Main execution
(async () => {
    try {
        // Step 1: Copy all folders from /layers to /comp_layers
        copyDirectories(srcDir, destDir);
        console.log('Folders copied successfully.');

        // Step 2: Compress images in /comp_layers to 200x200px
        await compressImages(destDir);
        console.log('Images compressed successfully.');
    } catch (error) {
        console.error('An error occurred:', error);
    }
})();

