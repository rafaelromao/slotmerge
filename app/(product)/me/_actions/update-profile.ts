"use server";

import { redirect } from "next/navigation";

import {
  buildUpdateProfileAction,
  type UpdateProfileActionState,
} from "../../../../src/profile/update-profile-action";

export const updateProfileAction = buildUpdateProfileAction();

export async function handleUpdateProfileFormSubmit(
  _prev: UpdateProfileActionState,
  formData: FormData,
): Promise<UpdateProfileActionState> {
  const state = await updateProfileAction(formData);
  if (state.ok === "success") {
    redirect("/me/profile?saved=1");
  }
  return state;
}
