export const VERSION=1;
export const TODAY='2026-10-28';
export const currentDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
export const round=n=>Math.round((n+Number.EPSILON)*1000)/1000;
export const copy=x=>JSON.parse(JSON.stringify(x));
export function stock(data,id){return round(data.materials.find(m=>m.id===id).openingStock+data.movements.filter(t=>t.materialId===id).reduce((s,t)=>s+(t.type==='out'?-t.quantity:t.quantity),0));}
export function status(data,m){const q=stock(data,m.id);return q===0?'품절':q<m.minStock?'부족':'정상';}
export function valuation(data){return data.materials.reduce((s,m)=>s+stock(data,m.id)*m.unitPrice,0);}
export function uid(prefix){return prefix+'-'+crypto.randomUUID();}
function fail(message){throw new Error(message);}
const text=(v,max=200)=>typeof v==='string'&&v.length<=max;
const positive=n=>Number.isFinite(n)&&n>0&&n<=1e9;
const nonnegative=n=>Number.isFinite(n)&&n>=0&&n<=1e9;
const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function validate(data){
 if(!data||data.version!==VERSION)fail('지원하지 않는 JSON 형식입니다. 이 프로그램에서 내보낸 JSON을 사용하세요.');
 for(const [key,max] of [['materials',5000],['movements',20000],['orders',5000],['suppliers',1000],['warehouses',100]]){
  if(!Array.isArray(data[key])||data[key].length>max)fail(key+' 데이터가 올바르지 않거나 허용 개수를 넘었습니다.');
  const ids=new Set();for(const r of data[key]){if(!r||!text(r.id,100)||!r.id||ids.has(r.id))fail(key+'의 ID가 누락되었거나 중복됩니다.');ids.add(r.id);}
 }
 if(!data.warehouses.length||!data.suppliers.length)fail('창고와 공급업체는 각각 1개 이상 필요합니다.');
 for(const w of data.warehouses)if(!text(w.name,80)||!w.name.trim()||!text(w.address,200))fail('창고 정보가 올바르지 않습니다.');
 for(const s of data.suppliers)if(!text(s.name,80)||!s.name.trim()||!text(s.contact,80)||!text(s.phone,50)||!text(s.email,100)||!text(s.category,80))fail('공급업체 정보가 올바르지 않습니다.');
 const materialIds=new Set(data.materials.map(m=>m.id)),warehouseIds=new Set(data.warehouses.map(w=>w.id)),supplierIds=new Set(data.suppliers.map(s=>s.id)),skus=new Set();
 for(const m of data.materials){
  if(!text(m.sku,40)||!m.sku.trim()||skus.has(m.sku.toUpperCase()))fail('자재코드가 누락되었거나 중복됩니다.');skus.add(m.sku.toUpperCase());
  if(!text(m.name,100)||!m.name.trim()||!text(m.spec,100)||!text(m.category,40)||!m.category.trim()||!text(m.unit,12)||!m.unit.trim()||!text(m.bin,40)||!nonnegative(m.unitPrice)||!nonnegative(m.minStock)||!nonnegative(m.openingStock)||!warehouseIds.has(m.warehouseId)||!supplierIds.has(m.supplierId))fail('자재 정보와 숫자, 창고·공급업체를 확인해 주세요.');
 }
 const sequence=new Set();
 for(const t of data.movements){
  if(!materialIds.has(t.materialId)||!['in','out','adjust'].includes(t.type)||!Number.isFinite(t.quantity)||Math.abs(t.quantity)>1e9||t.quantity===0||(t.type!=='adjust'&&t.quantity<0)||!date(t.date)||t.date>currentDate()||!Number.isSafeInteger(t.sequence)||t.sequence<0||sequence.has(t.sequence)||!text(t.partner,100)||!text(t.note,300)||!(t.orderId===null||text(t.orderId,100)))fail('입출고 수량, 날짜, 연결 자재 또는 순서가 올바르지 않습니다. 미래 날짜는 발주로 관리하세요.');sequence.add(t.sequence);
 }
 const qty=new Map(data.materials.map(m=>[m.id,m.openingStock]));
 for(const t of [...data.movements].sort((a,b)=>a.date.localeCompare(b.date)||a.sequence-b.sequence)){
  const n=round(qty.get(t.materialId)+(t.type==='out'?-t.quantity:t.quantity));if(n<0)fail(`${data.materials.find(m=>m.id===t.materialId).name}: ${t.date}의 재고가 음수가 됩니다. 입출고 수량과 날짜를 확인하세요.`);qty.set(t.materialId,n);
 }
 for(const o of data.orders){
  if(!materialIds.has(o.materialId)||!positive(o.quantity)||!nonnegative(o.unitPrice)||!date(o.expectedDate)||!['ordered','received','cancelled'].includes(o.status)||!text(o.note,300))fail('발주 정보가 올바르지 않습니다.');
  const receipts=data.movements.filter(t=>t.orderId===o.id);if(o.status==='received'){
   if(receipts.length!==1||receipts[0].materialId!==o.materialId||receipts[0].quantity!==o.quantity||receipts[0].type!=='in')fail('발주와 입고 이력이 일치하지 않습니다.');
  }else if(receipts.length)fail('입고되지 않은 발주에 입고 이력이 있습니다.');
 }
 if(data.movements.some(t=>t.orderId&&!data.orders.some(o=>o.id===t.orderId)))fail('입출고에 연결된 발주가 없습니다.');
 return data;
}
export function addMovement(data,record){const candidate=copy(data);candidate.movements.push({...record,id:record.id||uid('TX'),sequence:Math.max(0,...candidate.movements.map(t=>t.sequence))+1,orderId:record.orderId||null});return validate(candidate);}
export function receiveOrder(data,orderId,dateValue){const candidate=copy(data),o=candidate.orders.find(o=>o.id===orderId);if(!o||o.status!=='ordered')fail('입고 대기 중인 발주만 처리할 수 있습니다.');const m=candidate.materials.find(m=>m.id===o.materialId);o.status='received';candidate.movements.push({id:uid('TX'),materialId:o.materialId,type:'in',quantity:o.quantity,date:dateValue,partner:candidate.suppliers.find(s=>s.id===m.supplierId).name,note:'발주 입고 · '+o.id,orderId:o.id,sequence:Math.max(0,...candidate.movements.map(t=>t.sequence))+1});return validate(candidate);}
export function monthSeries(data,anchor=TODAY){const base=new Date(anchor+'T00:00:00Z');return Array.from({length:6},(_,i)=>{const d=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()-5+i,1)),key=d.toISOString().slice(0,7),rows=data.movements.filter(t=>t.date.startsWith(key));return{key,label:`${d.getUTCMonth()+1}월`,in:rows.filter(t=>t.type==='in').length,out:rows.filter(t=>t.type==='out').length};});}
