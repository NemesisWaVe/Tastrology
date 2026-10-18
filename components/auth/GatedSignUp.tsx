"use client";

import { SignUp } from "@clerk/nextjs";
import { AgeBlocked, AgeGate, useAgeOk } from "./AgeGate";

export function GatedSignUp() {
  const [age, setAge] = useAgeOk();
  if (age === "ok") return <SignUp />;
  if (age === "no") return <AgeBlocked />;
  return age === null ? <AgeGate onAnswer={setAge} /> : null;
}
