const ROTAS = "/cashier/78b7ab6f-eeeb-4726-8c1d-b8e77aa1b285,/commissions/providers/e30f15de-eb6c-48a6-9096-fa4d30c9a72a,/customers/9d270193-746d-4f43-8dde-15bb9ff931f7,/customers/9d270193-746d-4f43-8dde-15bb9ff931f7/edit,/financial/df0b8a76-4321-4487-9beb-dc3112ab6906,/interests/ccc05bf8-a506-4330-98b8-511834596aaf,/pdv/082a6e41-7776-42bc-98a9-b005057d8c18,/quick-sales/cd1e23e3-35fc-494c-8aea-ad999d7ed8f9,/service-orders/01634339-ac79-41cd-b1ac-4938f140fecd,/service-orders/01634339-ac79-41cd-b1ac-4938f140fecd/edit,/services/263b06d0-b827-4d11-b2b7-ea92dafbe80c/edit,/settings/users/732d4f80-a674-42ab-9291-a5853d9589f7/edit,/stock/702559d8-dcb7-47fe-b2c2-bb1f7ad353bb,/stock/702559d8-dcb7-47fe-b2c2-bb1f7ad353bb/edit,/stock/702559d8-dcb7-47fe-b2c2-bb1f7ad353bb/variations,/stock/purchases/c06aebef-5a66-4921-8010-6f9ce1600822,/stock/suppliers/3eade9b9-20d8-464c-85cb-84abc8d04027,/stock/suppliers/3eade9b9-20d8-464c-85cb-84abc8d04027/edit".split(",").filter(Boolean);
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newContext({viewport:{width:320,height:700}}).then(c=>c.newPage());
const erros=[]; p.on('pageerror',e=>erros.push(String(e).slice(0,70)));
await p.goto('http://localhost:3000/login');
await p.getByLabel('CPF').fill('86288366757'); await p.getByLabel('Senha').fill('Admin@2026');
await p.getByRole('button',{name:/entrar/i}).click();
await p.waitForURL(u=>!u.pathname.includes('/login'),{timeout:30000});
const CHAVE=/^(status|valor|pre[çc]o|total|diferen[çc]a|a receber|qtd|quantidade|tipo|ativo|saldo|perfil|contrato)/i;
let ok=0;
for (const r of ROTAS) {
  try {
    await p.goto('http://localhost:3000'+r,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1500);
    const m = await p.evaluate(() => {
      window.scrollTo(50,0); const x=window.scrollX; window.scrollTo(0,0);
      const vw=document.documentElement.clientWidth;
      const vis=(el)=>el.offsetParent!==null && !el.closest('[data-sonner-toaster]') && !el.closest('nextjs-portal');
      const dentro=(el)=>{let q=el.parentElement;while(q){const o=getComputedStyle(q).overflowX;if(o==='auto'||o==='scroll')return true;q=q.parentElement;}return false;};
      const fora=[]; for(const el of document.querySelectorAll('body *')){const c=el.getBoundingClientRect();
        if(c.right>vw+0.5&&c.width>0&&vis(el)&&!dentro(el)) fora.push(`${el.tagName}:${(el.textContent||'').trim().slice(0,18)}@${Math.round(c.right)}`);}
      const cortados=[...document.querySelectorAll('td,span,p,label,h1,h2,h3,a,button')].filter(e=>e.children.length===0&&vis(e)&&e.scrollWidth-e.clientWidth>3&&e.getBoundingClientRect().width>20).map(e=>`${e.textContent.trim().slice(0,20)}(+${e.scrollWidth-e.clientWidth})`);
      const t=document.querySelector('table'); let cf=[];
      if(t){const lim=t.parentElement.getBoundingClientRect().right; cf=[...t.querySelectorAll('th')].filter(h=>h.getBoundingClientRect().left>lim).map(h=>h.textContent.trim()).filter(Boolean);}
      return {rolou:x, fora:fora.slice(0,2), cortados:cortados.slice(0,3), cf, vazio:/nao encontrad|não encontrad/i.test(document.body.innerText)};
    });
    ok++;
    const dec=m.cf.filter(c=>CHAVE.test(c));
    if (m.rolou>0||m.fora.length||m.cortados.length||dec.length||m.vazio)
      console.log('!!', r.replace(/\/[0-9a-f-]{36}/,'/<id>'), JSON.stringify({...m, cf:dec}));
  } catch(e) { console.log('??', r.slice(0,40), String(e).slice(0,50)); }
}
console.log('=== medidas:', ok, '/', ROTAS.length);
console.log('ERROS JS:', erros.length?[...new Set(erros)].slice(0,3):'NENHUM');
await b.close();
