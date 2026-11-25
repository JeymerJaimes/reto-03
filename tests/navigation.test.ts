import { it,expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from '../app/page.tsx';
it('cada enlace abre el expediente elegido incluso antes de cargar JavaScript',async()=>{
  const html=renderToStaticMarkup(await Page({searchParams:Promise.resolve({caso:'sol-004'})}));
  for(let i=1;i<=6;i++)expect(html).toContain('href="?caso=sol-00'+i+'"');
  expect(html).toMatch(/href="\?caso=sol-004" aria-current="page"/);
  expect(html).toContain('COP 25.000.000');
  expect(html).not.toContain('COP 11.400.000');
});
