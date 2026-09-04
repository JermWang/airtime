"use client";

import { EffectComposer, Bloom, Vignette, SMAA } from "@react-three/postprocessing";

/** Restrained post: a whisper of bloom on the screens, a faint vignette, SMAA. */
export function Effects() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <SMAA />
      <Bloom luminanceThreshold={0.92} luminanceSmoothing={0.25} intensity={0.22} mipmapBlur radius={0.55} />
      <Vignette eskil={false} offset={0.28} darkness={0.55} />
    </EffectComposer>
  );
}
