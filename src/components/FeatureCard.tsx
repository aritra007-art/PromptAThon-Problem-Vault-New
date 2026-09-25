import React from 'react';
import { motion } from 'motion/react';

export interface FeatureCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  delay?: number;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({
  title,
  description,
  icon,
  gradient,
  delay = 0,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: 'easeOut', delay }}
      className="relative flex flex-col justify-start items-start w-full max-w-[260px] md:max-w-[300px] group mx-auto"
    >
      {/* Glow Background (Crucial) */}
      <div
        className="absolute inset-0 w-full h-[260px] md:h-[300px] opacity-60 rounded-[40px] pointer-events-none"
        style={{
          background: gradient,
          filter: 'blur(45px)',
        }}
      />

      {/* Foreground Card with Gradient Border (Crucial) */}
      <div
        className="relative self-stretch h-[260px] md:h-[300px] rounded-[40px] z-10 overflow-hidden"
        style={{
          border: '8px solid transparent',
          background: `linear-gradient(#1A1A1C, #1A1A1C) padding-box, ${gradient} border-box`,
        }}
      >
        {/* Content Inner Layout */}
        <div className="w-full h-full p-7 flex flex-col justify-between">
          <div className="text-white/90">
            {icon}
          </div>
          <div>
            <h3 className="text-white font-medium text-xl mb-3 tracking-tight">
              {title}
            </h3>
            <p className="text-gray-400 text-[14px] leading-[1.6] font-normal selection:bg-white/20">
              {description}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
