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

const markSvg=(size=760)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 2048 2048">
  <g transform="translate(1024 930) scale(23) translate(-30.5 -33.5)" fill="none" stroke="#14271d" stroke-linecap="round" stroke-linejoin="round">
    ${paths.map(([w,d])=>`<path vector-effect="non-scaling-stroke" stroke-width="${w}" d="${d}"/>`).join('')}
  </g>
  <circle cx="1290" cy="1696" r="28" fill="#d9f76d"/>
</svg>`);

async function main(){
  await sharp(profile).png({compressionLevel:9}).toFile(resolve(here,'flurbo-social-profile-2048.png'));

  const wordmark=await sharp(sourceLockup)
    .extract({left:340,top:0,width:800,height:400})
    .resize({width:1080,withoutEnlargement:false})
    .png()
    .toBuffer();
  const mark=await sharp(markSvg()).png().toBuffer();
  await sharp({create:{width:3000,height:1000,channels:4,background:'#f5f4ec'}})
    .composite([
      {input:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="1000"><rect width="24" height="1000" fill="#14271d"/></svg>'),left:0,top:0},
      {input:wordmark,left:300,top:346},
      {input:mark,left:2070,top:120},
    ])
    .png({compressionLevel:9})
    .toFile(resolve(here,'flurbo-social-banner-3000x1000.png'));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
