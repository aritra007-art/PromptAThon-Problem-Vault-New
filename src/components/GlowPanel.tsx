import React, { useState } from 'react';
import { motion } from 'motion/react';

export interface GlowPanelProps {
  children: React.ReactNode;
  className?: string;
  gradient?: string;
  borderGradient?: string;
  glowOpacity?: number;
  hoverGlowOpacity?: number;
  blur?: string;
  delay?: number;
  hover?: boolean;
  borderRadius?: string;
  onClick?: () => void;
  id?: string;
}

export const VAULT_GRADIENTS = {
  cyan: 'linear-gradient(137deg, #06B6D4 0%, #67E8F9 45%, #2563EB 100%)',
  purple: 'linear-gradient(137deg, #6366F1 0%, #A78BFA 45%, #D946EF 100%)',
  green: 'linear-gradient(137deg, #10B981 0%, #6EE7B7 45%, #22C55E 100%)',
  amber: 'linear-gradient(137deg, #F59E0B 0%, #FCD34D 45%, #FB923C 100%)',
  red: 'linear-gradient(137deg, #EF4444 0%, #FB7185 45%, #F43F5E 100%)',
  hero: 'linear-gradient(137deg, #06B6D4 0%, #6366F1 50%, #A78BFA 100%)',
  replication: 'linear-gradient(137deg, #6366F1 0%, #A78BFA 45%, #06B6D4 100%)',
  rebalancing: 'linear-gradient(137deg, #F59E0B 0%, #67E8F9 50%, #6366F1 100%)',
  subtle: 'linear-gradient(137deg, rgba(6,182,212,0.3) 0%, rgba(99,102,241,0.2) 50%, rgba(167,139,250,0.3) 100%)',
};

export const GlowPanel: React.FC<GlowPanelProps> = ({
  children,
  className = '',
  gradient = VAULT_GRADIENTS.cyan,
  borderGradient,
  glowOpacity = 0.35,
  hoverGlowOpacity,
  blur = '45px',
  delay = 0,
  hover = true,
  borderRadius = '24px',
  onClick,
  id,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Border gradient can be derived from the main gradient or specified
  const effectiveBorderGradient = borderGradient || gradient;
  const effectiveHoverGlow = hoverGlowOpacity !== undefined ? hoverGlowOpacity : Math.min(glowOpacity * 1.35, 0.65);
  const currentOpacity = hover && isHovered ? effectiveHoverGlow : glowOpacity;

  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut', delay }}
      whileHover={hover ? { scale: 1.01 } : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      className={`relative group ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* Glow layer */}
      <div
        className="absolute -inset-0.5 pointer-events-none transition-all duration-300 ease-out"
        style={{
          borderRadius,
          background: gradient,
          filter: `blur(${blur})`,
          opacity: currentOpacity,
        }}
      />

      {/* Foreground panel */}
      <div
        className="relative h-full w-full transition-all duration-200 ease-out"
        style={{
          borderRadius,
          background: `linear-gradient(#111113, #111113) padding-box, ${effectiveBorderGradient} border-box`,
          border: '1px solid transparent',
        }}
      >
        {children}
      </div>
    </motion.div>
  );
};
