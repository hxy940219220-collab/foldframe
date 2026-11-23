import type { PromotionPlan } from '@/api/materials/material.types'

export function planLabel(plan: PromotionPlan, home: string) {
  const name = plan.name || plan.title
  return plan.isDefault && name?.trim().toLowerCase() === 'default' ? home : name
}
