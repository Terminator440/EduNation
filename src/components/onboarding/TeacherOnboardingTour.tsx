import { useCallback } from "react";
import Joyride, { CallBackProps, STATUS, Step } from "react-joyride";

export const TEACHER_TOUR_STEPS: Step[] = [
  {
    target: "body",
    content:
      "Bun venit! Îți arătăm rapid unde adaugi note, unde vezi orarul și cum generezi rapoarte.",
    title: "Tour de prezentare",
    disableBeacon: true,
  },
  {
    target: '[data-tour="add-grade"]',
    content:
      "Aici adaugi note pentru elevi. În tabelul „Elevii Clasei”, apasă butonul „Notă” lângă un elev, alege materia și introduce nota (1–10).",
    title: "Unde pui nota",
    disableBeacon: true,
  },
  {
    target: '[data-tour="schedule"]',
    content:
      "În meniul din stânga, „Orar” îți arată programul orelor. Poți vedea orele și semna condica de aici.",
    title: "Orarul",
    disableBeacon: true,
  },
  {
    target: '[data-tour="reports"]',
    content:
      "„Rapoarte” generează documente și statistici. Deschide secțiunea din meniu pentru rapoarte și exporturi.",
    title: "Rapoarte",
    disableBeacon: true,
  },
];

interface TeacherOnboardingTourProps {
  run: boolean;
  onComplete: () => void;
}

export function TeacherOnboardingTour({ run, onComplete }: TeacherOnboardingTourProps) {
  const handleCallback = useCallback(
    (data: CallBackProps) => {
      const { status } = data;
      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        onComplete();
      }
    },
    [onComplete]
  );

  return (
    <Joyride
      steps={TEACHER_TOUR_STEPS}
      run={run}
      continuous
      showSkipButton
      showProgress
      callback={handleCallback}
      locale={{
        back: "Înapoi",
        close: "Închide",
        last: "Gata",
        next: "Mai departe",
        skip: "Omite tour",
      }}
      styles={{
        options: {
          primaryColor: "hsl(var(--primary))",
          textColor: "hsl(var(--foreground))",
          backgroundColor: "hsl(var(--card))",
          arrowColor: "hsl(var(--card))",
          overlayColor: "rgba(0, 0, 0, 0.5)",
        },
        tooltip: {
          borderRadius: 8,
          padding: 16,
        },
        tooltipContainer: {
          textAlign: "left",
        },
      }}
      floaterProps={{
        disableAnimation: false,
      }}
    />
  );
}
