const path = require("path");
const fs = require("fs");

const dirToFix = path.join(__dirname, "..", "data", "global_dataset_raw");

for (const file of fs.readdirSync(dirToFix)) {
  const filePath = path.join(dirToFix, file);
  const fileContent = fs.readFileSync(filePath, "utf8");
  const lines = fileContent.split("\n");
  const newLines = [];
  lines.forEach((line, index) => {
    if (index === 0) {
      newLines.push(
        "timestamp,balancerId,balancerIp,clientIpAccordingCloudflare,clientCountryAccordingCloudflare,balancerColocationCenter,targetDomain,scheme,httpVersion,tlsVersion,clientCountry,clientCity,clientAsn,clientNetwork,latencyTotal,latencyDNS,latencyTCP,latencyTLS,latencyFirstByte,latencyDownload"
      );
      return;
    }
    newLines.push(line.replace("null,", ""));
  });

  fs.writeFileSync(filePath, newLines.join("\n"));
}
