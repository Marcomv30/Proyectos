import React, { createContext, useContext } from 'react';

const EmpresaContext = createContext<number>(0);

export function EmpresaProvider({
  empresaId,
  children,
}: {
  empresaId: number;
  children: React.ReactNode;
}) {
  return (
    <EmpresaContext.Provider value={empresaId}>
      {children}
    </EmpresaContext.Provider>
  );
}

export function useEmpresaId(): number {
  return useContext(EmpresaContext);
}
