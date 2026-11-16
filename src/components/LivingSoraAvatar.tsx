import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import type { CompanionPose } from '../types';

interface LivingSoraAvatarProps {
  pose: CompanionPose;
  isSpeaking: boolean;
  speechLevel: number;
  isListening?: boolean;
  caption?: string;
}

export function LivingSoraAvatar({
  pose,
  isSpeaking,
  speechLevel,
  isListening = false,
  caption,
}: LivingSoraAvatarProps) {
  const [isBlinking, setIsBlinking] = useState(false);
  const [glancingAtUser, setGlancingAtUser] = useState(false);
  const [syntheticMouth, setSyntheticMouth] = useState(0);

  // Natural double/single eye blinking loop
  useEffect(() => {
    let blinkTimeout: number;
    let resetTimeout: number;

    const scheduleBlink = () => {
      const delay = 2200 + Math.random() * 2900;
      blinkTimeout = window.setTimeout(() => {
        setIsBlinking(true);
        resetTimeout = window.setTimeout(() => {
          setIsBlinking(false);
          scheduleBlink();
        }, 125);
      }, delay);
    };

    scheduleBlink();
    return () => {
      window.clearTimeout(blinkTimeout);
      window.clearTimeout(resetTimeout);
    };
  }, []);

  // Periodic "watching out on me" attentive glance toward viewer while working
  useEffect(() => {
    if (isSpeaking || pose === 'speaking') {
      setGlancingAtUser(true);
      return;
    }

    let glanceTimer: number;
    let returnTimer: number;

    const scheduleGlance = () => {
      const wait = 5500 + Math.random() * 5500;
      glanceTimer = window.setTimeout(() => {
        setGlancingAtUser(true);
        returnTimer = window.setTimeout(() => {
          setGlancingAtUser(false);
          scheduleGlance();
        }, 2100 + Math.random() * 1100);
      }, wait);
    };

    scheduleGlance();
    return () => {
      window.clearTimeout(glanceTimer);
      window.clearTimeout(returnTimer);
    };
  }, [isSpeaking, pose]);

  // Natural multi-harmonic syllable cadence for non-PCM speech replies
  useEffect(() => {
    if (!isSpeaking || speechLevel > 0.02) {
      setSyntheticMouth(0);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      const syllable =
        Math.abs(Math.sin(t * 8.8) * 0.5 + Math.sin(t * 13.7) * 0.32 + Math.cos(t * 4.7) * 0.25);
      setSyntheticMouth(Math.min(1, Math.max(0.06, syllable * 0.9)));
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [isSpeaking, speechLevel]);

  const effectiveOpen = isSpeaking
    ? Math.min(1, Math.max(0.06, speechLevel > 0.02 ? speechLevel * 1.45 : syntheticMouth))
    : 0;

  const activePose: CompanionPose = isSpeaking ? 'speaking' : pose;
  const lookingAtViewer = isSpeaking || activePose === 'speaking' || glancingAtUser;

  // Eye gaze & head orientation
  const eyeOffsetX = lookingAtViewer ? 0.3 : activePose === 'typing' ? -2.6 : -1.1;
  const eyeOffsetY = lookingAtViewer ? -0.2 : activePose === 'typing' ? 2.1 : 0.7;

  const headRotate = lookingAtViewer
    ? isSpeaking
      ? -0.8 + effectiveOpen * 2.2
      : 1.2
    : activePose === 'typing'
      ? -4.2
      : 2.0;

  const headY = lookingAtViewer ? (isSpeaking ? -1.4 - effectiveOpen * 1.5 : -0.5) : 3.2;

  const mouthHeight = effectiveOpen * 11.2;
  const mouthHalfW = 10.2 - effectiveOpen * 1.8;

  return (
    <div className="relative aspect-[16/9] max-h-[170px] w-full overflow-hidden bg-[#090D1B] lg:max-h-[198px]">
      <svg
        viewBox="0 0 640 360"
        className="h-full w-full select-none object-cover"
        role="img"
        aria-label="Sora keeping you company at her midnight desk"
      >
        <defs>
          <linearGradient id="soraSkyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#070A17" />
            <stop offset="55%" stopColor="#101833" />
            <stop offset="100%" stopColor="#1B274C" />
          </linearGradient>

          <linearGradient id="soraWallGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#121629" />
            <stop offset="100%" stopColor="#080B16" />
          </linearGradient>

          <linearGradient id="soraDeskGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#35241D" />
            <stop offset="40%" stopColor="#241814" />
            <stop offset="100%" stopColor="#130D0B" />
          </linearGradient>

          {/* Two-tone lighting: warm lamp key + soft cool night rim */}
          <radialGradient id="soraLampCone" cx="0.17" cy="0.43" r="0.68">
            <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.44" />
            <stop offset="28%" stopColor="#F59E0B" stopOpacity="0.2" />
            <stop offset="70%" stopColor="#B45309" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#090B14" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="soraScreenGlow" cx="0.33" cy="0.65" r="0.36">
            <stop offset="0%" stopColor="#93C5FD" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#93C5FD" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="soraSkin" x1="0.15" y1="0" x2="0.88" y2="1">
            <stop offset="0%" stopColor="#FCE0CC" />
            <stop offset="48%" stopColor="#F1C3A7" />
            <stop offset="85%" stopColor="#DCA284" />
            <stop offset="100%" stopColor="#C4886C" />
          </linearGradient>

          <linearGradient id="soraSweater" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#566E91" />
            <stop offset="45%" stopColor="#3A4D6D" />
            <stop offset="100%" stopColor="#212D44" />
          </linearGradient>

          <linearGradient id="soraHair" x1="0.1" y1="0" x2="0.7" y2="1">
            <stop offset="0%" stopColor="#322B3B" />
            <stop offset="45%" stopColor="#1E1928" />
            <stop offset="100%" stopColor="#0F0D16" />
          </linearGradient>

          <radialGradient id="soraIris" cx="0.45" cy="0.42" r="0.58">
            <stop offset="0%" stopColor="#5C4038" />
            <stop offset="68%" stopColor="#342224" />
            <stop offset="100%" stopColor="#1B1218" />
          </radialGradient>

          <filter id="softBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>

          <clipPath id="soraWinClip">
            <rect x="166" y="20" width="388" height="202" rx="4" />
          </clipPath>
        </defs>

        {/* Room Background */}
        <rect width="640" height="360" fill="url(#soraWallGrad)" />

        {/* Rainy Midnight Window */}
        <rect x="160" y="14" width="400" height="214" rx="6" fill="#0B0F1E" stroke="#262F4D" strokeWidth="3" />
        <g clipPath="url(#soraWinClip)">
          <rect x="166" y="20" width="388" height="202" fill="url(#soraSkyGrad)" />

          {/* Out-of-focus city bokeh */}
          <g filter="url(#softBlur)">
            <circle cx="225" cy="172" r="14" fill="#FBBF24" opacity="0.22" />
            <circle cx="242" cy="186" r="9" fill="#60A5FA" opacity="0.22" />
            <circle cx="288" cy="158" r="11" fill="#F59E0B" opacity="0.18" />
            <circle cx="445" cy="160" r="17" fill="#93C5FD" opacity="0.16" />
            <circle cx="490" cy="178" r="12" fill="#FBBF24" opacity="0.2" />
            <circle cx="520" cy="152" r="8" fill="#FDE68A" opacity="0.22" />
          </g>

          {/* City Skyline */}
          <path
            d="M166 222 L166 168 L192 168 L192 146 L224 146 L224 174 L262 174 L262 138 L298 138 L298 164 L336 164 L336 148 L428 148 L428 130 L470 130 L470 166 L508 166 L508 142 L554 142 L554 222 Z"
            fill="#0C1123"
            opacity="0.92"
          />

          {/* Soft rain streaks */}
          <motion.g
            animate={{ y: [0, 40] }}
            transition={{ repeat: Infinity, duration: 1.35, ease: 'linear' }}
            opacity="0.26"
            stroke="#BAE6FD"
            strokeWidth="1"
            strokeLinecap="round"
          >
            <line x1="196" y1="14" x2="188" y2="34" />
            <line x1="252" y1="48" x2="244" y2="68" />
            <line x1="308" y1="10" x2="300" y2="30" />
            <line x1="370" y1="62" x2="362" y2="82" />
            <line x1="426" y1="26" x2="418" y2="46" />
            <line x1="484" y1="58" x2="476" y2="78" />
            <line x1="532" y1="18" x2="524" y2="38" />
            <line x1="224" y1="106" x2="216" y2="126" />
            <line x1="292" y1="120" x2="284" y2="140" />
            <line x1="454" y1="108" x2="446" y2="128" />
          </motion.g>
        </g>

        {/* Window Frame Mullions */}
        <line x1="360" y1="14" x2="360" y2="228" stroke="#192038" strokeWidth="6" />
        <line x1="160" y1="138" x2="560" y2="138" stroke="#192038" strokeWidth="4" />

        {/* Desk Surface */}
        <polygon points="0,248 640,248 640,360 0,360" fill="url(#soraDeskGrad)" />
        <line x1="0" y1="248" x2="640" y2="248" stroke="#4D372E" strokeWidth="2" />

        {/* Brass Lamp */}
        <g>
          <ellipse cx="76" cy="272" rx="28" ry="8" fill="#171218" />
          <path d="M72 270 L54 170 L95 114" stroke="#A67F4A" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <circle cx="54" cy="170" r="4.5" fill="#CCA162" />
          <path d="M76 104 L128 133 L112 151 L68 122 Z" fill="#CD9649" stroke="#7A5527" strokeWidth="1.5" />
          <ellipse cx="96" cy="139" rx="14" ry="7" transform="rotate(26 96 139)" fill="#FEF3C7" />
        </g>

        {/* Ambient Warm Lamp Glow */}
        <motion.rect
          x="0"
          y="0"
          width="640"
          height="360"
          fill="url(#soraLampCone)"
          animate={{ opacity: [0.9, 1, 0.92] }}
          transition={{ repeat: Infinity, duration: 5.2, ease: 'easeInOut' }}
          style={{ pointerEvents: 'none' }}
        />

        {/* LIVING SORA CHARACTER */}
        <motion.g
          animate={{ y: [0, -1.8, 0] }}
          transition={{ repeat: Infinity, duration: 4.2, ease: 'easeInOut' }}
        >
          {/* Back Hair Mass with subtle movement */}
          <motion.g
            animate={{ rotate: headRotate * 0.42, y: headY }}
            transition={{ type: 'spring', stiffness: 110, damping: 18 }}
            style={{ originX: '422px', originY: '162px' }}
          >
            <path
              d="M366 126 C350 156, 349 206, 363 236 L480 236 C494 206, 492 154, 476 124 C458 92, 384 92, 366 126 Z"
              fill="url(#soraHair)"
            />
          </motion.g>

          {/* Shoulders & Cozy Knit Sweater */}
          <path
            d="M348 280 C352 216, 376 194, 422 194 C468 194, 494 220, 502 280 Z"
            fill="url(#soraSweater)"
          />
          {/* Subtle Shoulder Shadow under Neck */}
          <ellipse cx="422" cy="212" rx="34" ry="12" fill="#1B2538" opacity="0.45" />
          {/* Ribbed Turtleneck Collar */}
          <path
            d="M393 194 C393 183, 451 183, 451 194 L455 215 C435 223, 409 223, 389 215 Z"
            fill="#425778"
            stroke="#29384F"
            strokeWidth="1.5"
          />
          {/* Warm lamp rim highlight on left shoulder */}
          <path
            d="M353 248 C360 218, 376 202, 394 198"
            stroke="#FBBF24"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
            opacity="0.28"
          />

          {/* Neck + Chin Cast Shadow */}
          <path d="M406 172 L406 202 C416 209, 428 209, 438 202 L438 172 Z" fill="#DDA78A" />
          <path d="M406 176 Q422 192 438 176 L438 186 Q422 196 406 186 Z" fill="#B57A5E" opacity="0.52" />

          {/* HEAD & EXPRESSIVE FACE RIG */}
          <motion.g
            animate={{ rotate: headRotate, y: headY }}
            transition={{ type: 'spring', stiffness: 120, damping: 17 }}
            style={{ originX: '422px', originY: '166px' }}
          >
            {/* Ear with subtle inner fold */}
            <ellipse cx="462" cy="145" rx="5.8" ry="9.5" fill="#DDA689" />
            <path d="M461 140 Q464 145 461 150" stroke="#B67E62" strokeWidth="1.3" fill="none" />

            {/* Soft Jaw & Face Contour */}
            <path
              d="M379 124 C379 94, 465 94, 465 128 C465 162, 446 187, 421 187 C396 187, 379 162, 379 124 Z"
              fill="url(#soraSkin)"
            />

            {/* Soft Warm Cheek Shading & Nose Bridge Highlight */}
            <ellipse cx="395" cy="153" rx="10" ry="5" fill="#E88675" opacity="0.32" />
            <ellipse cx="445" cy="153" rx="10" ry="5" fill="#E88675" opacity="0.28" />
            <path d="M420 137 L419 152" stroke="#FFF4EA" strokeWidth="1.8" strokeLinecap="round" opacity="0.35" />

            {/* Eyebrows with subtle conversational lift */}
            <path
              d={`M390 ${127 - effectiveOpen * 1.6} Q400 ${123 - effectiveOpen * 1.9} 410 ${127 - effectiveOpen * 1.3}`}
              stroke="#241D2B"
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d={`M431 ${127 - effectiveOpen * 1.3} Q441 ${123 - effectiveOpen * 1.9} 451 ${127 - effectiveOpen * 1.6}`}
              stroke="#241D2B"
              strokeWidth="2.2"
              strokeLinecap="round"
              fill="none"
            />

            {/* Detailed Eyes (Crease + Sclera + Iris + Dual Catchlights + Blink) */}
            <g>
              {/* Left Eye */}
              <path d="M392 132 Q401 129 409 132" stroke="#C58B6F" strokeWidth="1" fill="none" opacity="0.65" />
              <g transform={`translate(401, 139) scale(1, ${isBlinking ? 0.06 : 1})`}>
                <ellipse cx="0" cy="0" rx="7.8" ry="5.5" fill="#F8FAFC" />
                <circle cx={eyeOffsetX} cy={eyeOffsetY} r="4.3" fill="url(#soraIris)" />
                <circle cx={eyeOffsetX} cy={eyeOffsetY} r="2.0" fill="#120C14" />
                <circle cx={eyeOffsetX - 1.5} cy={eyeOffsetY - 1.5} r="1.45" fill="#FFFFFF" opacity="0.95" />
                <circle cx={eyeOffsetX + 1.4} cy={eyeOffsetY + 1.2} r="0.7" fill="#FDE68A" opacity="0.75" />
                <path d="M-8.5 -0.8 Q0 -6.8 8.5 -0.8" stroke="#1B1522" strokeWidth="2.3" strokeLinecap="round" fill="none" />
              </g>

              {/* Right Eye */}
              <path d="M432 132 Q441 129 450 132" stroke="#C58B6F" strokeWidth="1" fill="none" opacity="0.65" />
              <g transform={`translate(441, 139) scale(1, ${isBlinking ? 0.06 : 1})`}>
                <ellipse cx="0" cy="0" rx="7.8" ry="5.5" fill="#F8FAFC" />
                <circle cx={eyeOffsetX} cy={eyeOffsetY} r="4.3" fill="url(#soraIris)" />
                <circle cx={eyeOffsetX} cy={eyeOffsetY} r="2.0" fill="#120C14" />
                <circle cx={eyeOffsetX - 1.5} cy={eyeOffsetY - 1.5} r="1.45" fill="#FFFFFF" opacity="0.95" />
                <circle cx={eyeOffsetX + 1.4} cy={eyeOffsetY + 1.2} r="0.7" fill="#FDE68A" opacity="0.75" />
                <path d="M-8.5 -0.8 Q0 -6.8 8.5 -0.8" stroke="#1B1522" strokeWidth="2.3" strokeLinecap="round" fill="none" />
              </g>
            </g>

            {/* Nose Tip & Soft Shadow */}
            <path d="M420 144 Q417 153 421 156" stroke="#BA8064" strokeWidth="1.6" strokeLinecap="round" fill="none" />

            {/* Expressive Organic Lip-Sync Mouth */}
            <g transform="translate(421, 168.5)">
              {effectiveOpen > 0.05 ? (
                <>
                  <path
                    d={`M-${mouthHalfW} 0 Q0 -${2 + mouthHeight * 0.25} ${mouthHalfW} 0 Q0 ${3.2 + mouthHeight} -${mouthHalfW} 0 Z`}
                    fill="#67232E"
                  />
                  {effectiveOpen > 0.28 && (
                    <path
                      d={`M-${mouthHalfW * 0.62} 0.3 Q0 -0.7 ${mouthHalfW * 0.62} 0.3 L${mouthHalfW * 0.54} 2.1 Q0 2.5 -${mouthHalfW * 0.54} 2.1 Z`}
                      fill="#FAF0EC"
                      opacity="0.9"
                    />
                  )}
                  <path
                    d={`M-${mouthHalfW * 0.92} -0.2 Q0 -${1.8 + mouthHeight * 0.18} ${mouthHalfW * 0.92} -0.2`}
                    stroke="#A64D4B"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d={`M-${mouthHalfW * 0.8} 0.6 Q0 ${3.6 + mouthHeight} ${mouthHalfW * 0.8} 0.6`}
                    stroke="#BC6260"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    fill="none"
                  />
                </>
              ) : (
                <>
                  <path
                    d="M-9.5 -0.4 Q0 4.2 9.5 -0.4"
                    stroke="#9F504D"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M-4.5 2.4 Q0 3.7 4.5 2.4"
                    stroke="#D68E80"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    fill="none"
                    opacity="0.65"
                  />
                </>
              )}
            </g>

            {/* Front Bangs & Framing Hair Strands */}
            <path
              d="M375 130 C375 90, 467 86, 471 130 C464 114, 444 108, 426 111 C412 114, 395 121, 383 135 C380 146, 377 158, 374 170 C370 155, 370 140, 375 130 Z"
              fill="url(#soraHair)"
            />
            <motion.path
              d="M380 128 C373 148, 372 172, 377 192"
              stroke="#1A1523"
              strokeWidth="6.5"
              strokeLinecap="round"
              fill="none"
              animate={{ rotate: [0, 1.2, 0] }}
              transition={{ repeat: Infinity, duration: 4.8, ease: 'easeInOut' }}
              style={{ originX: '380px', originY: '128px' }}
            />
            <motion.path
              d="M457 112 C473 130, 475 160, 464 192"
              stroke="#191522"
              strokeWidth="9"
              strokeLinecap="round"
              fill="none"
              animate={{ rotate: [0, -1, 0] }}
              transition={{ repeat: Infinity, duration: 5.2, ease: 'easeInOut' }}
              style={{ originX: '457px', originY: '112px' }}
            />
            {/* Warm Amber Hair Rim Highlight */}
            <path
              d="M378 122 C384 100, 412 92, 434 96"
              stroke="#FCD34D"
              strokeWidth="1.7"
              strokeLinecap="round"
              fill="none"
              opacity="0.4"
            />
          </motion.g>

          {/* Laptop */}
          <g>
            <polygon points="154,174 268,184 282,262 172,250" fill="#171D30" stroke="#2D3752" strokeWidth="2" />
            <polygon points="161,180 262,189 274,254 177,244" fill="#0F172A" />
            <g opacity="0.68">
              <line x1="176" y1="196" x2="226" y2="201" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" />
              <line x1="179" y1="206" x2="245" y2="212" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="181" y1="216" x2="232" y2="221" stroke="#FBBF24" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="183" y1="226" x2="248" y2="232" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" />
            </g>
            <polygon points="172,250 282,262 340,280 220,268" fill="#283149" stroke="#3B4766" strokeWidth="1.2" />
            <rect x="110" y="130" width="260" height="190" fill="url(#soraScreenGlow)" style={{ pointerEvents: 'none' }} />
          </g>

          {/* Open Notebook */}
          <g transform="translate(330, 276)">
            <polygon points="0,12 72,4 94,28 22,36" fill="#E2E8F0" />
            <polygon points="72,4 140,12 160,34 94,28" fill="#CBD5E1" />
            <line x1="72" y1="4" x2="94" y2="28" stroke="#94A3B8" strokeWidth="1.5" />
          </g>

          {/* Pose-Specific Hands & Arms */}
          {activePose === 'typing' && (
            <g>
              <motion.g
                animate={{ y: [0, -1.9, 0.4, -1.3, 0] }}
                transition={{ repeat: Infinity, duration: 0.72, ease: 'easeInOut' }}
              >
                <path d="M364 218 C340 240, 314 252, 286 258" stroke="#3A4D6D" strokeWidth="22" strokeLinecap="round" fill="none" />
                <ellipse cx="280" cy="260" rx="11" ry="6" fill="#E9B89B" />
              </motion.g>
              <motion.g
                animate={{ y: [-1.3, 0.4, -1.9, 0, -1.3] }}
                transition={{ repeat: Infinity, duration: 0.66, ease: 'easeInOut' }}
              >
                <path d="M466 226 C428 250, 366 262, 316 266" stroke="#455B7F" strokeWidth="24" strokeLinecap="round" fill="none" />
                <ellipse cx="308" cy="267" rx="11.5" ry="6" fill="#F1C3A7" />
              </motion.g>
            </g>
          )}

          {activePose === 'coffee' && (
            <g>
              <path d="M364 218 C344 248, 336 268, 334 282" stroke="#3A4D6D" strokeWidth="22" strokeLinecap="round" fill="none" />
              <motion.g
                animate={{ y: [0, -2.5, 0] }}
                transition={{ repeat: Infinity, duration: 3.4, ease: 'easeInOut' }}
              >
                <path d="M472 224 C470 250, 444 250, 412 226" stroke="#455B7F" strokeWidth="23" strokeLinecap="round" fill="none" />
                <g transform="translate(384, 198)">
                  <rect x="0" y="0" width="28" height="30" rx="5" fill="#D6C4B0" stroke="#A6907A" strokeWidth="1.5" />
                  <path d="M28 7 C37 7, 37 22, 28 22" stroke="#D6C4B0" strokeWidth="3.5" fill="none" />
                  <ellipse cx="14" cy="2" rx="12" ry="3" fill="#4A2E20" />
                  <ellipse cx="16" cy="14" rx="8" ry="6" fill="#F1C3A7" />
                  <motion.path
                    d="M10 -4 Q6 -14 12 -22"
                    stroke="#E2E8F0"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    fill="none"
                    animate={{ opacity: [0.15, 0.45, 0.15], y: [0, -6, -10] }}
                    transition={{ repeat: Infinity, duration: 2.8, ease: 'easeInOut' }}
                  />
                </g>
              </motion.g>
            </g>
          )}

          {activePose === 'speaking' && (
            <g>
              <path d="M364 218 C346 248, 338 266, 336 278" stroke="#3A4D6D" strokeWidth="22" strokeLinecap="round" fill="none" />
              <ellipse cx="334" cy="280" rx="10" ry="5.5" fill="#E9B89B" />
              <motion.g
                animate={{ y: isSpeaking ? [0, -2 - effectiveOpen * 3, 0] : [0, -1, 0] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
              >
                <path d="M472 224 C458 258, 424 274, 386 276" stroke="#455B7F" strokeWidth="24" strokeLinecap="round" fill="none" />
                <ellipse cx="380" cy="276" rx="11" ry="6" fill="#F1C3A7" />
              </motion.g>
            </g>
          )}

          {activePose !== 'coffee' && (
            <g transform="translate(274, 282)">
              <rect x="0" y="0" width="24" height="25" rx="4" fill="#B9A693" stroke="#857160" strokeWidth="1.2" />
              <path d="M24 6 C31 6, 31 18, 24 18" stroke="#B9A693" strokeWidth="3" fill="none" />
              <ellipse cx="12" cy="2" rx="10" ry="2.6" fill="#3E251A" />
              <motion.path
                d="M12 -3 Q9 -11 14 -18"
                stroke="#F8FAFC"
                strokeWidth="1.4"
                strokeLinecap="round"
                fill="none"
                animate={{ opacity: [0.1, 0.35, 0.1], y: [0, -5, -9] }}
                transition={{ repeat: Infinity, duration: 3.1, ease: 'easeInOut' }}
              />
            </g>
          )}
        </motion.g>
      </svg>

      {/* Measured Bottom Scrim + Live Speech Caption */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#090B14]/95 via-[#090B14]/55 to-transparent" />

      <div className="absolute inset-x-3.5 top-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-200/90 drop-shadow">
          <span>Sora</span>
          <span aria-hidden="true" className="text-slate-400">·</span>
          <span className="text-slate-300">
            {isSpeaking
              ? 'Speaking'
              : isListening
                ? 'Listening live'
                : glancingAtUser
                  ? 'Checking on you'
                  : activePose === 'coffee'
                    ? 'Taking a sip'
                    : 'Studying alongside you'}
          </span>
        </div>

        {(isSpeaking || isListening) && (
          <div
            aria-label="Voice activity"
            className="flex h-5 items-center gap-1 rounded bg-black/45 px-2 backdrop-blur-md"
          >
            {[0.4, 0.85, 1, 0.7, 0.45].map((w, i) => {
              const barScale = isSpeaking
                ? Math.max(0.2, effectiveOpen * w)
                : Math.max(0.18, speechLevel * w);
              return (
                <span
                  key={i}
                  style={{ transform: `scaleY(${Math.min(1, barScale)})` }}
                  className={`h-3.5 w-0.5 origin-center rounded-full transition-transform duration-75 ${
                    isSpeaking ? 'bg-amber-400' : 'bg-sky-300'
                  }`}
                />
              );
            })}
          </div>
        )}
      </div>

      {caption && (
        <div className="absolute inset-x-3.5 bottom-2.5">
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-100 sm:text-sm">
            {caption}
          </p>
        </div>
      )}
    </div>
  );
}
