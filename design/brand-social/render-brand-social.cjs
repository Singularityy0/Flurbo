const sharp=require('sharp');
const {readFile}=require('node:fs/promises');
const {resolve}=require('node:path');

const here=__dirname;
const profile=resolve(here,'flurbo-social-profile.svg');
const sourceLockup=resolve(here,'..','brand-final','flurbo-logo-1600x400.png');

const paths=[
  ['39','M11 19C18 7 39 5 51 14c10 8 7 29-4 38-11 10-31 4-39-9-6-10-3-18 3-24Z'],
  ['39','M20 19c8-6 22-4 27 5 5 9-2 20-12 23-10 3-20-3-21-13-1-6 1-11 6-15Z'],
  ['48','M27 27c6-4 14 0 14 7-1 6-9 9-14 5-5-4-5-9 0-12Z'],
];

const markSvg=(width=300,height=320)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 70 72">
  <g transform="translate(4 0)" fill="none" stroke="#14271d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    ${paths.map(([,d])=>`<path d="${d}"/>`).join('')}
  </g>
  <circle cx="46" cy="67" r="1.8" fill="#d9f76d"/>
</svg>`);

const taglineSvg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="120" viewBox="0 0 1600 120">
  <text x="800" y="68" text-anchor="middle" fill="#496055" font-family="Space Grotesk, Segoe UI, Arial, sans-serif" font-size="42" font-weight="500" letter-spacing="1.5">Trade what happens together.</text>
</svg>`);

async function main(){
  await sharp(profile).png({compressionLevel:9}).toFile(resolve(here,'flurbo-social-profile-2048.png'));

  const wordmarkCrop=await sharp(sourceLockup)
    .extract({left:340,top:0,width:800,height:400})
    .png()
    .toBuffer();
  const wordmark=await sharp(wordmarkCrop)
    .trim({background:{r:0,g:0,b:0,alpha:0}})
    .resize({width:760,withoutEnlargement:false})
    .png()
    .toBuffer();
  const mark=await sharp(markSvg()).png().toBuffer();
  await sharp({create:{width:3000,height:1000,channels:4,background:'#fbfaf5'}})
    .composite([
      {input:mark,left:955,top:245},
      {input:wordmark,left:1305,top:266},
      {input:taglineSvg,left:700,top:590},
    ])
    .png({compressionLevel:9})
    .toFile(resolve(here,'flurbo-social-banner-3000x1000.png'));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
