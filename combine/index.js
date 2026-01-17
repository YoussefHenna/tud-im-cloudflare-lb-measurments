const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data","test1");
const OUTPUT_FILE = path.join(__dirname, "combined.csv");

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Data directory not found: ${DATA_DIR}`);
    process.exit(1);
  }

  const allFiles = fs.readdirSync(DATA_DIR);
  const csvFiles = allFiles
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .sort();

  if (csvFiles.length === 0) {
    console.error(`No CSV files found in: ${DATA_DIR}`);
    process.exit(1);
  }

  console.log(
    `Found ${csvFiles.length} CSV files. Combining into ${OUTPUT_FILE} ...`
  );

  let headerLine = null;
  let headerColCount = null;
  let isFirstDataFileProcessed = false;

  const outStream = fs.createWriteStream(OUTPUT_FILE, { encoding: "utf8" });

  try {
    csvFiles.forEach((fileName, fileIndex) => {
      const filePath = path.join(DATA_DIR, fileName);
      const raw = fs.readFileSync(filePath, "utf8");

      const lines = raw.split(/\r?\n/);

      let firstNonEmptyIdx = 0;
      while (
        firstNonEmptyIdx < lines.length &&
        lines[firstNonEmptyIdx].trim() === ""
      ) {
        firstNonEmptyIdx++;
      }

      if (firstNonEmptyIdx >= lines.length) {
        console.warn(`Skipping empty file: ${fileName}`);
        return;
      }

      if (!isFirstDataFileProcessed) {
        // Use the first non-empty line of the first file as the header
        headerLine = lines[firstNonEmptyIdx];
        headerColCount = headerLine.split(",").length;
        isFirstDataFileProcessed = true;

        // Write the header once
        outStream.write(headerLine + "\n");
        console.log(`Using header from: ${fileName}`);
      }

      // For the first file, skip its header line when writing data rows
      // For subsequent files, we assume the first non-empty line is also a header
      const dataStartIdx =
        fileIndex === 0 ? firstNonEmptyIdx + 1 : firstNonEmptyIdx + 1;

      for (let i = dataStartIdx; i < lines.length; i++) {
        let line = lines[i];

        const actualLineNumber = i + 1;

        if (line.trim() === "") {
          continue; // ignore blank lines
        }

        // Remove all double quotes from the line
        line = line.replaceAll('"', "");
        const cols = line.split(",");
        let colCount = cols.length;

        if (colCount !== headerColCount) {
          // 13th column should be a number, if not, then previous col
          // which is a city name has a comma in the name breaking the line
          // need to merge the previous column with the current column
          // Loop as it can contain multiple commas
          while (isNaN(parseInt(cols[13]))) {
            cols[12] = `"${cols[12].replaceAll('"', "")},${cols[13]}"`;
            console.log(`Fixing city name to be: ${cols[12]}`);
            cols.splice(13, 1);

            line = cols.join(",");
            colCount--;
          }

          if (colCount !== headerColCount) {
            console.error(
              `Error: Row has more or less entries than header.\n` +
                `  File: ${fileName}\n` +
                `  Line: ${actualLineNumber}\n` +
                `  Header columns: ${headerColCount} \n\t(${headerLine})\n` +
                `  Row columns: ${colCount} \n\t(${line})`
            );
            outStream.end();
            process.exit(1);
          }
        }

        outStream.write(line + "\n");
      }
    });
  } finally {
    outStream.end();
  }

  console.log("Done.");
}

if (require.main === module) {
  main();
}
