import { SceneAppPage, EmbeddedScene, SceneFlexLayout, SceneFlexItem } from '@grafana/scenes';
import { ROUTES, prefixRoute } from '../utils/utils.routing';
import { PreferencesScene } from '../components/Preferences/PreferencesScene';

/**
 * Browser-local preferences page. Reachable by viewers (including anonymous sessions).
 */
export const preferencesPage = new SceneAppPage({
    title: 'Preferences',
    url: prefixRoute(`/${ROUTES.Preferences}`),
    routePath: `${ROUTES.Preferences}/*`,
    hideFromBreadcrumbs: true,
    getScene: () => new EmbeddedScene({
        body: new SceneFlexLayout({
            direction: 'column',
            children: [
                new SceneFlexItem({
                    body: new PreferencesScene({}),
                }),
            ],
        }),
    }),
});
