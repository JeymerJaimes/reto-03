import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect,it } from 'vitest';
import { prepare } from '../src/application/prepare.ts';
import { Fields,OrderView,Checks } from '../app/purchase-view.tsx';
it('presenta SOL-004 como tabla de compra y conserva los datos de las herramientas sin volcar JSON',()=>{
  const b=prepare(process.cwd(),'sol-004');
  const html=renderToStaticMarkup(createElement(OrderView,{order:b.payload}));
  expect(html).toContain('<table>');expect(html).toContain('COP 25.000.000');expect(html).toContain('Cloud Andina');
  const args=renderToStaticMarkup(createElement(Fields,{value:{caso:'sol-004',payload:b.payload}}));
  expect(args).toContain('Expediente');expect(args).toContain('25');expect(args).not.toMatch(/<pre|<code|&quot;:/);
  const checks=renderToStaticMarkup(createElement(Checks,{report:b.report}));
  expect(checks).toContain('Requiere confirmación');expect(checks).toContain('26.500.000');
});
