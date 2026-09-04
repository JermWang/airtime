"use client";

import { EffectComposer, SMAA } from "@react-three/postprocessing";

/**
 * Post-processing: edge antialiasing, and nothing else.
 *
 * There used to be a bloom pass here. The main screen is the brightest thing in
 * the room by a wide margin, so bloom spread a halo out of every bright frame
 * and laid a permanent haze over the picture - a glow sitting on top of the
 * programme rather than an effect in the room. A broadcast display should show
 * the frame that was sent, so the pass is gone. The vignette went with it: on a
 * screen that fills most of the viewport it darkened the corners of the video
 * itself, which is the same mistake in a different direction.
 */
export function Effects() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <SMAA />
    </EffectComposer>
  );
}
