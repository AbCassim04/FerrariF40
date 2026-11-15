import { create } from 'zustand';
import { SCENE } from '../config/scene';

/** 9A: the camera feel profile ("classic", "anchored", "grab"): `?cam=` for this visit, else the remembered choice. */
export type CameraProfileName = keyof typeof SCENE.controls.profiles;

const KEY = 'f40.cameraFeel';
const valid = (v: string | null): v is CameraProfileName => !!v && v in SCENE.controls.profiles;

function initial(): CameraProfileName {
  const url = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('cam') : null;
  if (valid(url)) return url;
  try {
    const saved = localStorage.getItem(KEY);
    if (valid(saved)) return saved;
  } catch {
    /* storage blocked: the default */
  }
  return SCENE.controls.defaultProfile;
}

export const useCameraFeel = create<{ profile: CameraProfileName; setProfile: (p: CameraProfileName) => void }>((set) => ({
  profile: initial(),
  setProfile: (profile) => {
    try {
      localStorage.setItem(KEY, profile);
    } catch {
      /* not remembered */
    }
    set({ profile });
  },
}));

export const cameraProfile = () => SCENE.controls.profiles[useCameraFeel.getState().profile];
