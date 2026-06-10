import React from 'react';

interface SessionWizardProgressProps {
  currentStep: number;
  steps: { id: number; label: string }[];
}

export function SessionWizardProgress({ currentStep, steps }: SessionWizardProgressProps) {
  return (
    <ul className="steps steps-horizontal w-full mb-12 overflow-x-auto pb-4 no-scrollbar">
      {steps.map((step) => (
        <li
          key={step.id}
          className={`step text-[9px] font-bold uppercase tracking-wider ${
            currentStep === step.id
              ? 'step-accent text-accent'
              : currentStep > step.id
                ? 'step-primary text-primary'
                : 'text-base-content/40'
          }`}
        >
          {step.label}
        </li>
      ))}
    </ul>
  );
}
