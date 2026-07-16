import sharp from "sharp";

const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#151816"/>
  <rect x="72" y="72" width="1056" height="486" rx="8" fill="#1d221e" stroke="#455046" stroke-width="2"/>
  <rect x="112" y="112" width="72" height="72" rx="8" fill="#187653"/>
  <path d="M130 165v-34h9l9 14 9-14h9v34h-9v-20l-9 14-9-14v20z" fill="#f7f9f5"/>
  <text x="216" y="164" fill="#e7ece6" font-family="Arial, sans-serif" font-size="42" font-weight="700">Max</text>
  <text x="112" y="318" fill="#e7ece6" font-family="Arial, sans-serif" font-size="68" font-weight="700">Engineering notes</text>
  <text x="112" y="392" fill="#9eaa9f" font-family="Arial, sans-serif" font-size="34">AI · Cloud · Web · Architecture</text>
  <line x1="112" y1="468" x2="1088" y2="468" stroke="#455046" stroke-width="2"/>
  <text x="112" y="520" fill="#69cd97" font-family="Arial, sans-serif" font-size="28">me.983768.xyz</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile("public/og-default.png");
console.log("Generated public/og-default.png");
