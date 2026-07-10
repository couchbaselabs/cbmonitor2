import { seedInputValues } from './inputSeed';

describe('seedInputValues', () => {
    it('pads a single pre-filled value up to minCount', () => {
        expect(seedInputValues(['snap-a'], 2)).toEqual(['snap-a', '']);
    });

    it('returns all-empty slots when no initial values are given', () => {
        expect(seedInputValues(undefined, 2)).toEqual(['', '']);
    });

    it('does not truncate when initialValues already meets minCount', () => {
        expect(seedInputValues(['snap-a', 'snap-b'], 2)).toEqual(['snap-a', 'snap-b']);
    });

    it('does not truncate when initialValues exceeds minCount', () => {
        expect(seedInputValues(['snap-a', 'snap-b', 'snap-c'], 2)).toEqual(['snap-a', 'snap-b', 'snap-c']);
    });

    it('handles an empty initialValues array the same as undefined', () => {
        expect(seedInputValues([], 2)).toEqual(['', '']);
    });
});
