import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const cache = new Map();
function load(file) {
  const filename = path.resolve(file);
  if(cache.has(filename)) return cache.get(filename);
  const loaded={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(name=>load(path.resolve(path.dirname(filename),name+'.ts')),loaded,loaded.exports);
  cache.set(filename,loaded.exports);return loaded.exports;
}
const {defaultTheme,themePresets,parsePreferences,themeVariables,validTheme,legacyTones}=load('lib/themes.ts');
assert.equal(parsePreferences('{bad').active.id,'baseline');
assert.equal(parsePreferences('{}').active.id,'baseline');
for(const theme of themePresets) assert.deepEqual(validTheme(theme),theme);
assert.equal(validTheme({...defaultTheme,colors:{...defaultTheme.colors,bg:'url(evil)'}}),null);
for(const hex of Object.keys(legacyTones)) assert.equal(themeVariables(defaultTheme)['--tone-'+hex],'#'+hex);
assert.equal(themeVariables(themePresets.find(p=>p.id==='forest'))['--accent'],'#6ee7a0');
const {mannequinAreas}=load('lib/mannequin/data.ts');
const {distributeVolume}=load('lib/tension.ts');
const lifts=[{exercise:'Bench',weight:100,reps:10}],profiles=[{exercise:'Bench',allocations:[{muscle:'chest',percent:100}]}];
const {groups}=distributeVolume(lifts,profiles);
const defaultAreas=mannequinAreas(groups,lifts,profiles,true);
const recolored=mannequinAreas(groups,lifts,profiles,true,{'muscle-chest':'#112233'});
assert.equal(recolored.find(a=>a.id==='chest:clavicular').color,'#112233');
const withoutColor = area => Object.fromEntries(Object.entries(area).filter(([key])=>key!=='color'));
assert.deepEqual(recolored.map(withoutColor),defaultAreas.map(withoutColor));
console.log('PASS: preset validation, malformed storage fallback, original tints preserved, customized palette, 3D colors change without changing any allocation data.');

const {filterThemes,themeCatalog}=load('lib/themes.ts');
assert.equal(themePresets.length,50);
assert.equal(new Set(themePresets.map(theme=>theme.id)).size,50);
assert.equal(new Set(themePresets.map(theme=>JSON.stringify(theme.colors))).size,50);
assert.equal(filterThemes(themePresets,'  ToKiO  ','All themes')[0].name,'Tokyo Night');
assert.equal(filterThemes(themePresets,'','Neon').length,9);
assert.equal(filterThemes(themePresets,'','Light').length,7);
assert.equal(filterThemes(themePresets,'nothing-matches-this','All themes').length,0);
const custom={...defaultTheme,id:'custom-test',name:'My Arcade'};
assert.equal(filterThemes([...themePresets,custom],'arcade','Custom')[0].id,'custom-test');
function luminance(hex) {
  const channels=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255).map(value=>value<=.04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
  return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
}
function contrast(a,b) { const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
for(const theme of themePresets.slice(5)) {
  assert.ok(themeCatalog[theme.id],theme.name);
  for(const text of ['fg','muted','subtle']) {
    for(const background of ['bg','surface','surface-raised','surface-hover']) {
      assert.ok(contrast(theme.colors[text],theme.colors[background])>=4.5,`${theme.name}: ${text} against ${background} contrast ${contrast(theme.colors[text],theme.colors[background])}`);
    }
  }
  for(const color of ['accent','chart','weight-up','weight-down']) assert.ok(contrast(theme.colors[color],theme.colors.surface)>=3,`${theme.name}: ${color}`);
}
console.log('PASS: 50 unique presets, categorized search including Tokio alias/custom themes, and readable text/graph contrast in every new palette.');
