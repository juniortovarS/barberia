import React from "react";
import { Player } from "@remotion/player";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

// Helper to calculate scissor X position at any frame
const getScissorX = (f, fps) => {
  const t = spring({
    frame: f,
    fps,
    config: {
      damping: 12,
      mass: 0.8,
      stiffness: 80,
    },
  });
  return interpolate(t, [0, 1], [-20, 120]);
};

// Generate static configuration for sparks to avoid recreation on every render
const SPARKS_COUNT = 24;
const sparks = Array.from({ length: SPARKS_COUNT }).map((_, i) => {
  // Distribute spawn frames between frame 8 and 48
  const spawnFrame = 8 + i * 1.6;
  // Angle: mostly backwards (to the left, since scissors move right)
  // 180 degrees (Math.PI) is left. We sweep around it.
  const angle = Math.PI + (Math.random() - 0.5) * (Math.PI / 1.6);
  const speed = 2.5 + Math.random() * 5;
  const size = 2 + Math.random() * 3;
  return { spawnFrame, angle, speed, size, id: i };
});

// Remotion composition component
const ScissorAnimation = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Current translation progress (0 to 1)
  const translation = spring({
    frame,
    fps,
    config: {
      damping: 12,
      mass: 0.8,
      stiffness: 80,
    },
  });

  // Interpolate current scissor X position (left: -20% to 120%)
  const x = interpolate(translation, [0, 1], [-20, 120]);

  // Scissor cutting action: blade oscillation
  // Fast trigonometric sine wave to open/close blades
  const scissorAngle = Math.abs(Math.sin(frame * 0.45)) * 24;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: "transparent",
        overflow: "hidden",
      }}
    >
      {/* 1. Glowing slash cut line following the scissor */}
      <div
        style={{
          position: "absolute",
          left: `${x}%`,
          top: 0,
          width: "3px",
          height: "100%",
          background: "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0) 100%)",
          boxShadow: "0 0 15px rgba(255, 255, 255, 0.9), 0 0 5px rgba(255, 255, 255, 0.5)",
          transform: "rotate(12deg)",
          transformOrigin: "center",
          opacity: interpolate(translation, [0, 0.08, 0.92, 1], [0, 1, 1, 0]),
          pointerEvents: "none",
        }}
      />

      {/* 2. Particle Sparks system trailing the scissor intersection */}
      {sparks.map((spark) => {
        const age = frame - spark.spawnFrame;
        if (age < 0 || age > 14) return null;

        // Position where the spark was spawned
        const spawnX = getScissorX(spark.spawnFrame, fps);

        // Move outwards with gravity
        const dx = Math.cos(spark.angle) * spark.speed * age;
        const dy = Math.sin(spark.angle) * spark.speed * age + 0.15 * age * age; // gravity pulls sparks down

        // Fade out as it ages
        const opacity = 1 - age / 14;

        return (
          <div
            key={spark.id}
            style={{
              position: "absolute",
              left: `calc(${spawnX}% + ${dx}px)`,
              top: `calc(50% + ${dy}px)`,
              width: `${spark.size}px`,
              height: `${spark.size}px`,
              backgroundColor: "#ffffff",
              borderRadius: "50%",
              boxShadow: "0 0 6px #ffffff, 0 0 2px #ffffff",
              opacity: opacity,
              pointerEvents: "none",
            }}
          />
        );
      })}

      {/* 3. The Custom Vector Scissor with pivot cutting blades */}
      <div
        style={{
          position: "absolute",
          left: `${x}%`,
          top: "50%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <svg
          width="130"
          height="130"
          viewBox="0 0 200 200"
          style={{
            transform: "rotate(-12deg)", // align with the slash cut line
            overflow: "visible",
            filter: "drop-shadow(0px 8px 24px rgba(255, 255, 255, 0.35))",
          }}
        >
          {/* Upper Blade & Lower Finger Ring */}
          <g transform={`rotate(${-scissorAngle}, 100, 100)`}>
            {/* Blade body */}
            <path d="M 100 100 L 195 90 L 100 102 Z" fill="#ffffff" />
            <path d="M 100 100 L 195 90" stroke="#dddddd" strokeWidth="1.5" />
            {/* Shank */}
            <path d="M 100 100 L 60 118" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" />
            {/* Finger Loop */}
            <circle cx="45" cy="124" r="17" stroke="#ffffff" strokeWidth="6" fill="none" />
          </g>

          {/* Lower Blade & Upper Finger Ring */}
          <g transform={`rotate(${scissorAngle}, 100, 100)`}>
            {/* Blade body */}
            <path d="M 100 100 L 195 110 L 100 98 Z" fill="#ffffff" />
            <path d="M 100 100 L 195 110" stroke="#dddddd" strokeWidth="1.5" />
            {/* Shank */}
            <path d="M 100 100 L 60 82" stroke="#ffffff" strokeWidth="8" strokeLinecap="round" />
            {/* Finger Loop */}
            <circle cx="45" cy="76" r="17" stroke="#ffffff" strokeWidth="6" fill="none" />
          </g>

          {/* Pivot screw in the center */}
          <circle cx="100" cy="100" r="5" fill="#0c0c0c" stroke="#ffffff" strokeWidth="2.5" />
          <circle cx="100" cy="100" r="1.5" fill="#ffffff" />
        </svg>
      </div>
    </div>
  );
};

const ScissorTransition = ({ play }) => {
  if (!play) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 50,
        pointerEvents: "none",
      }}
    >
      <Player
        component={ScissorAnimation}
        durationInFrames={60} // 2 seconds at 30fps
        fps={30}
        compositionWidth={1200}
        compositionHeight={400}
        style={{
          width: "100%",
          height: "100%",
          background: "transparent",
        }}
        controls={false}
        play={true}
        loop={false}
      />
    </div>
  );
};

export default ScissorTransition;

