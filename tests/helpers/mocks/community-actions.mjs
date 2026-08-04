import { makeMock } from "../mock-state.mjs";

export const COMMUNITY_ACTION_TYPES = ["like", "confirm", "gone", "problem", "privacy"];

export function isCommunityActionType(value) {
  return COMMUNITY_ACTION_TYPES.includes(value);
}

export const {
  setCommunityAction,
  removeCommunityAction,
  getCommunityAction,
  communityActionCountsFor,
  likeWeightSumsFor,
  evaluateCommunityThresholds,
} = makeMock({
  setCommunityAction: "setCommunityAction",
  removeCommunityAction: "removeCommunityAction",
  getCommunityAction: "getCommunityAction",
  communityActionCountsFor: "communityActionCountsFor",
  likeWeightSumsFor: "likeWeightSumsFor",
  evaluateCommunityThresholds: "evaluateCommunityThresholds",
});
