/**
 * Seeds InputScene's input row values: starts from initialValues (if any)
 * and pads with empty slots up to minCount. Kept dependency-free (no
 * @grafana/* imports) so it's testable without pulling in the
 * @grafana/ui barrel import chain.
 */
export function seedInputValues(initialValues: string[] | undefined, minCount: number): string[] {
    const seeded = initialValues ? [...initialValues] : [];
    while (seeded.length < minCount) {
        seeded.push('');
    }
    return seeded;
}
