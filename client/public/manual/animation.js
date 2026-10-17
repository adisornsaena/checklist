if(location.search.indexOf('embed=1')>-1)document.body.classList.add('embed');

const $=(s,r=document)=>r.querySelector(s);
const stage=$('#stage'),box=$('#box'),cur=$('#cursor'),fin=$('#fin');
let scale=1,run=0,paused=false,speed=1;
function fit(){scale=box.clientWidth/960;stage.style.transform='scale('+scale+')'}
addEventListener('resize',fit);fit();

const sleep=ms=>new Promise((res,rej)=>{const id=run;let left=ms;const tick=()=>{if(id!==run)return rej('abort');if(paused)return setTimeout(tick,100);left-=40*speed;left<=0?res():setTimeout(tick,40)};tick()});
const rel=el=>{const s=stage.getBoundingClientRect(),r=el.getBoundingClientRect();return{x:(r.left-s.left)/scale,y:(r.top-s.top)/scale,w:r.width/scale,h:r.height/scale}};
async function moveTo(el,dx=0,dy=0){const p=rel(el);cur.style.left=(p.x+p.w/2+dx)+'px';cur.style.top=(p.y+p.h/2+dy)+'px';await sleep(780)}
async function click(el){cur.classList.add('pr');const p=rel(cur);const r=document.createElement('div');r.className='rip';r.style.left=(p.x+3)+'px';r.style.top=(p.y+3)+'px';stage.appendChild(r);setTimeout(()=>r.remove(),500);await sleep(160);cur.classList.remove('pr');await sleep(220)}
async function type(box,text,d=70){const v=$('.v',box);box.classList.add('f');for(const ch of [...text]){v.textContent+=ch;await sleep(d)}box.classList.remove('f')}
function show(id){document.querySelectorAll('.scr').forEach(s=>s.classList.toggle('on',s.id===id))}
async function scrollTo(el,pad=100){const t=(el.getBoundingClientRect().top-fin.getBoundingClientRect().top)/scale;fin.style.transform='translateY('+(-Math.max(0,t-pad))+'px)';await sleep(900)}
const setProg=n=>{$('#prog').style.width=n+'%';$('#progt').textContent='ความคืบหน้า '+n+'%'};
async function toast(el,t){el.textContent=t;el.classList.add('on');await sleep(1500);el.classList.remove('on')}
const tick=el=>el.classList.add('on');
const cap=(i,t,x)=>{$('#cno').textContent=i;$('#ctitle').textContent=t;$('#ctext').textContent=x;document.querySelectorAll('#dots i').forEach((d,k)=>{d.className=k+1<i?'done':k+1===i?'on':''})};
const STEPS=6;$('#dots').innerHTML='<i></i>'.repeat(STEPS);

function reset(){
  fin.style.transition='none';fin.style.transform='';setTimeout(()=>fin.style.transition='',50);
  document.querySelectorAll('.v').forEach(v=>v.textContent='');
  $('#f-rcv').textContent='17 ต.ค. 2569';
  document.querySelectorAll('.cb').forEach(c=>c.classList.remove('on'));
  document.querySelectorAll('.in').forEach(i=>i.classList.remove('err','f','dis'));
  ['t1d','t2d','t1o','t2o'].forEach(i=>$('#'+i).textContent='');
  $('#caseno').textContent='เอกสารใหม่';$('#badge').style.display='none';$('#badge').className='badge';$('#badge').textContent='กำลังดำเนินการ';
  $('#b-save').style.display='';$('#b-close').style.display='none';
  $('#alert').className='alert';setProg(0);$('#print').classList.remove('on');$('#pop').classList.remove('on');
  cur.style.left='480px';cur.style.top='300px';
}

async function play(){
  const id=++run;
  try{
    reset();
    // 1
    show('s-login');cap(1,'เข้าสู่ระบบ','ใส่ชื่อผู้ใช้และรหัสผ่านที่ผู้ดูแลระบบกำหนดให้ แล้วกด "เข้าสู่ระบบ"');await sleep(900);
    await moveTo($('#lg-u'));await click();await type($('#lg-u'),'somchai');
    await moveTo($('#lg-p'));await click();await type($('#lg-p'),'••••••••',90);
    await moveTo($('#lg-b'));await click();await sleep(300);
    // 2
    show('s-home');cap(2,'เลือกแบบฟอร์มที่ต้องการ','แบบฟอร์มแยกตามหน่วยงาน ตัวเลขที่มุมการ์ดบอกจำนวนเอกสารที่กำลังดำเนินการและปิดงานแล้ว');await sleep(1200);
    await moveTo($('#tile1'));$('#tile1').classList.add('h');await sleep(600);await click();
    // 3
    show('s-form');cap(3,'กรอกข้อมูลผู้ขอรับบริการ','ช่องที่มีเครื่องหมาย * ต้องกรอก ถ้าลืม ระบบจะแจ้งเตือนและไฮไลต์ช่องที่ขาด');await sleep(1200);
    await moveTo($('#b-save'));await click();
    $('#alert').textContent='กรุณากรอก ชื่อผู้ขอรับบริการ (หน่วยงาน/องค์กร), ชื่อผู้ประสานงาน';$('#alert').classList.add('on');
    $('#f-req').classList.add('err');$('#f-coo').classList.add('err');await sleep(1800);
    await moveTo($('#f-req'));await click();$('#f-req').classList.remove('err');await type($('#f-req'),'โรงเรียนตัวอย่างวิทยา');
    await moveTo($('#f-coo'));await click();$('#f-coo').classList.remove('err');$('#alert').classList.remove('on');await type($('#f-coo'),'คุณสมหญิง ใจดี');
    await moveTo($('#f-tel'));await click();await type($('#f-tel'),'081-234-5678');
    // checks
    cap(3,'ติ๊กรายการตรวจสอบเอกสาร','ติ๊กถูกเมื่อตรวจแล้ว แถบความคืบหน้าจะเพิ่มขึ้นให้อัตโนมัติ');
    await scrollTo($('#sec-checks'),70);
    let n=0;for(const k of ['c1','c2','c3']){await moveTo($('#'+k+' .cb'));await click();tick($('#'+k+' .cb'));$('#'+k).classList.add('d');n++;setProg(Math.round(n/5*100)-(n===3?0:0));}
    setProg(60);
    // steps
    cap(3,'บันทึกผลการดำเนินงานแต่ละขั้นตอน','เลือกผลการดำเนินงาน ระบบใส่วันที่ให้อัตโนมัติ (แก้ไขได้) แล้วระบุผู้ดำเนินการ');
    await scrollTo($('#sec-steps'),70);
    await moveTo($('#t1a'));await click();tick($('#t1a'));$('#t1d').textContent='17 ต.ค. 2569';$('#t1o').textContent='สมชาย';$('#t1').classList.add('d');setProg(80);await sleep(500);
    await moveTo($('#t2a'));await click();tick($('#t2a'));$('#t2d').textContent='17 ต.ค. 2569';$('#t2o').textContent='สมชาย';$('#t2').classList.add('d');setProg(100);await sleep(700);
    // 4
    cap(4,'บันทึกเอกสาร','ระบบออกเลขที่เอกสารให้อัตโนมัติ แยกตามหน่วยงาน เช่น OK-2569-00001 (OKMD)');
    fin.style.transform='';await sleep(900);
    await moveTo($('#b-save'));await click();
    $('#caseno').textContent='OK-2569-00001';$('#badge').style.display='';
    await toast($('#toast'),'บันทึกเรียบร้อย');await sleep(700);
    // 5
    cap(5,'ปิดงาน','ก่อนปิดงานต้องกรอก "วันที่ดำเนินการแล้วเสร็จ" และ "ผู้ปิดงาน" ให้เรียบร้อย');
    $('#b-close').style.display='';await sleep(500);
    await scrollTo($('#f-by'),260);
    await moveTo($('#b-close'));await click();
    $('#alert').textContent='กรุณากรอกผู้ปิดงาน และ วันที่ดำเนินการแล้วเสร็จให้เรียบร้อยก่อนปิดงาน';$('#alert').classList.add('on');
    $('#f-date').classList.add('err');$('#f-by').classList.add('err');fin.style.transform='';await sleep(1700);
    await scrollTo($('#f-by'),260);
    await moveTo($('#f-date'));await click();$('#f-date').classList.remove('err');await type($('#f-date'),'17 ต.ค. 2569');
    await moveTo($('#f-by'));await click();$('#f-by').classList.remove('err');$('#alert').classList.remove('on');await type($('#f-by'),'คุณสมชาย');
    await moveTo($('#b-close'));await click();
    $('#pop').classList.add('on');await sleep(900);
    await moveTo($('#pop-ok'));await click();$('#pop').classList.remove('on');
    $('#badge').className='badge cl';$('#badge').textContent='ปิดงานแล้ว';$('#b-close').style.display='none';$('#b-save').style.display='none';
    document.querySelectorAll('#s-form .in').forEach(i=>i.classList.add('dis'));
    await toast($('#toast'),'ปิดงานแล้ว — ฟอร์มถูกล็อก');await sleep(600);
    // 6
    cap(6,'พิมพ์ / บันทึกเป็น PDF ขนาด A4','กดปุ่ม "พิมพ์ / PDF" เอกสารจะพอดีกระดาษ A4 แผ่นเดียว (ข้อความยาวจะขึ้นบรรทัดใหม่)');
    fin.style.transform='';await sleep(900);
    await moveTo($('#b-print'));await click();$('#print').classList.add('on');await sleep(4200);$('#print').classList.remove('on');await sleep(400);
    // end
    show('end');document.querySelectorAll('#dots i').forEach(d=>d.className='done');
    $('#ctitle').textContent='จบการสาธิต';$('#ctext').textContent='กด "เล่นใหม่" เพื่อดูอีกครั้ง';cur.style.left='-40px';
  }catch(e){if(e!=='abort')console.error(e)}
}
$('#bpause').onclick=e=>{paused=!paused;e.target.textContent=paused?'▶ เล่นต่อ':'⏸ หยุด'};
$('#brestart').onclick=()=>{paused=false;$('#bpause').textContent='⏸ หยุด';play()};
$('#bspeed').onchange=e=>{speed=parseFloat(e.target.value);document.documentElement.style.setProperty('--spd',speed)};
document.fonts?.ready.finally(play);

/* ส่งความสูงของหน้าให้หน้าคู่มือ (parent) ปรับขนาด iframe ให้พอดี */
(function(){function send(){if(parent!==window)parent.postMessage({type:'manual-h',h:Math.ceil(document.querySelector('.wrap').getBoundingClientRect().height)+8},location.origin)}
addEventListener('resize',function(){setTimeout(send,50)});addEventListener('load',send);setTimeout(send,300);})();
