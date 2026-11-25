import { centers, suppliers, taxes, terms } from '../../domain/master-data.ts';
import { parseJson, source } from './source.ts';
export function readMasters(directory: string) {
  const file = (name: string) => source(directory, 'maestros/' + name + '.json');
  const files = {proveedores:file('proveedores'), centros:file('centros-costo'), iva:file('indicadores-iva'), pagos:file('condiciones-pago')};
  const data = {proveedores:parseJson(files.proveedores,suppliers), centros:parseJson(files.centros,centers),
    iva:parseJson(files.iva,taxes), pagos:parseJson(files.pagos,terms)};
  return {data, ref: (catalog: keyof typeof files, pointer: string) => files[catalog].ref(pointer)};
}
