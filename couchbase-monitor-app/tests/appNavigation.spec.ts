import { test, expect } from './fixtures';
import { ROUTES } from '../src/constants';

test.describe('navigating app', () => {
  test('page one should render successfully', async ({ gotoPage, page }) => {
    await gotoPage(`/${ROUTES.Showfast}`);
    await expect(page.getByText('Welcome to the Showfast dashboard.')).toBeVisible();
  });
});
