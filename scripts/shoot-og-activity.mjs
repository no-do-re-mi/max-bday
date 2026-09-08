// Regenerates assets/og-activity.png: a real screenshot of the activity
// modal, so the link preview shows the question people are being asked
// rather than a summary of it.
//
//   npx serve .           (or any static server on :8896 with /activity)
//   node scripts/shoot-og-activity.mjs
//
// Re-run whenever the modal's copy or layout changes.
import { chromium } from 'playwright';
const OUT='/home/user/max-bday/assets/og-activity.png';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
// 1200x630 is the card size; render at 2x then downscale for crisp text.
const c=await b.newContext({viewport:{width:1200,height:630},deviceScaleFactor:2});
const p=await c.newPage();
await p.goto('http://localhost:8896/activity',{waitUntil:'networkidle'});
await p.evaluate(()=>document.fonts.ready);
await p.waitForTimeout(1200);
await p.evaluate(()=>{
  // The modal is taller than a preview card, so anchor it to the top: the
  // card should open on the question, not the middle of the form.
  const s=document.createElement('style');
  s.textContent = `.act-scrim{overflow:hidden!important;padding:0!important}
                   .act-close{display:none!important}`;
  document.head.append(s);
});
await p.waitForTimeout(900);   // let a few sparkles be mid-twinkle
await p.screenshot({path:OUT});
const size = await p.evaluate(()=>[innerWidth,innerHeight]);
console.log('captured at', size.join('x'), '(2x)');
await b.close();
