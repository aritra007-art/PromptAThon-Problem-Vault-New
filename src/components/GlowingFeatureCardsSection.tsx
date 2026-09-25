import React from 'react';
import { Monitor, Palette, Zap } from 'lucide-react';
import { FeatureCard } from './FeatureCard';

export const GlowingFeatureCardsSection: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center p-6 md:p-12 font-sans relative overflow-hidden">
      {/* CSS grid to hold the 3 feature cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-3 lg:gap-3 w-full max-w-[936px]">
        {/* Card 1 ("Hardware") */}
        <FeatureCard
          title="Hardware"
          description="My entire desktop setup is built for power. It is silent, durable, and holds my focus."
          icon={<Monitor size={32} strokeWidth={2.5} />}
          gradient="linear-gradient(137deg, #FF3D77 0%, #FFB1CE 45%, #FF9D3C 100%)"
          delay={0.1}
        />

        {/* Card 2 ("Studio") */}
        <FeatureCard
          title="Studio"
          description="Studio is where I define every single pixel. It is the hub for each canvas I deliver."
          icon={<Palette size={32} strokeWidth={2.5} />}
          gradient="linear-gradient(137deg, #FFFFFF 0%, #7DD3FC 45%, #06B6D4 100%)"
          delay={0.2}
        />

        {/* Card 3 ("Motion") */}
        <FeatureCard
          title="Motion"
          description="I use Motion to build lively prototypes, bridging the gap between views and code."
          icon={<Zap size={32} strokeWidth={2.5} />}
          gradient="linear-gradient(137deg, #4361EE 0%, #E0AEFF 45%, #F72585 100%)"
          delay={0.3}
        />
      </div>
    </div>
  );
};
