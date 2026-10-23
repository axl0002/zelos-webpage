/** Shared taxonomy for user ranking flags and private-upload rejection. */
export const rankedReviewReasons = {
  incorrect_exercise: "Incorrect exercise or progression",
  incorrect_measurement: "Incorrect hold time or rep count",
  unacceptable_form: "Unacceptable form",
  unacceptable_filming: "Filming rules not met",
  incorrect_start_frame: "Incorrect hold start frame",
  incorrect_end_frame: "Incorrect hold end frame",
  incorrect_hold_frames: "Incorrect hold start and end frames",
} as const;

export const holdTimingReasons = new Set<string>([
  "incorrect_start_frame", "incorrect_end_frame", "incorrect_hold_frames",
]);
