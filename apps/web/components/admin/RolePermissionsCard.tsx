import Image from 'next/image';

const permissions = [
  { label: 'Ver documentos y procedimientos de sus áreas', admin: '✓', supervisor: '✓', employee: '✓' },
  { label: 'Ejecutar procedimientos paso a paso', admin: '✓', supervisor: '✓', employee: '✓' },
  { label: 'Usar el asistente', admin: '✓', supervisor: '✓', employee: '✓' },
  { label: 'Ver métricas', admin: 'Todas', supervisor: 'Su área', employee: '—' },
  { label: 'Cargar documentos y escribir procedimientos', admin: '✓', supervisor: '—', employee: '—' },
  { label: 'Invitar usuarios y asignar áreas', admin: '✓', supervisor: '—', employee: '—' },
];

export function RolePermissionsCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm">
      <h2 className="text-base font-bold text-[#0B4233]">Qué puede hacer cada rol</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Resumen de accesos y responsabilidades según la matriz de permisos.
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-100 text-zinc-400">
              <th className="pb-3 font-medium">Permiso</th>
              <th className="pb-3 text-center font-medium">Admin</th>
              <th className="pb-3 text-center font-medium">Supervisor</th>
              <th className="pb-3 text-center font-medium">Empleado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50 text-zinc-700">
            {permissions.map((p) => (
              <tr key={p.label} className="hover:bg-zinc-50/50">
                <td className="py-2.5 pr-2 font-medium">{p.label}</td>
                <td className="py-2.5 text-center">
                  {p.admin === '✓' ? (
                    <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">✓</span>
                  ) : (
                    <span className="text-zinc-600 font-medium">{p.admin}</span>
                  )}
                </td>
                <td className="py-2.5 text-center">
                  {p.supervisor === '✓' ? (
                    <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">✓</span>
                  ) : p.supervisor === '—' ? (
                    <span className="text-zinc-300">—</span>
                  ) : (
                    <span className="text-zinc-600 font-medium">{p.supervisor}</span>
                  )}
                </td>
                <td className="py-2.5 text-center">
                  {p.employee === '✓' ? (
                    <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">✓</span>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end">
        <div className="relative h-20 w-16 select-none opacity-90">
          <Image
            src="/hornero.png"
            alt="Mascota hornero PispIAr"
            fill
            className="object-contain"
          />
        </div>
      </div>
    </div>
  );
}
