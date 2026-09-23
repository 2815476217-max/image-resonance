import type { ReactNode } from 'react';
export type TransitionPhase='enter'|'visible'|'exit';
export default function TransitionLayer({phase,children}:{phase:TransitionPhase;children:ReactNode}){
  return <div className={`person-transition transition-${phase}`}>{children}</div>;
}
