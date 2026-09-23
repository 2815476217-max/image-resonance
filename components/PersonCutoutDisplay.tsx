import type { ImageDisplayProps } from './SingleDisplay';
type Props=ImageDisplayProps & {hologram?:boolean};
/** PNG 原生 alpha 直接在黑底合成，不加白色容器，不拉伸人物。 */
export default function PersonCutoutDisplay({src,hologram=false,onReady,onError}:Props){
  const person=()=> <div className="person-motion"><img className="character-greeting" src={src} alt="" draggable={false} onLoad={onReady} onError={onError}/></div>;
  return hologram?<div className="hologram-layout person-hologram">{['top','right','bottom','left'].map(side=><div className={`hologram-face face-${side}`} key={side}><div className="face-orientation">{person()}</div></div>)}</div>:<div className="person-single">{person()}</div>;
}
