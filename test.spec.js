// @ts-check
import { test, expect } from '@playwright/test';
import axios from 'axios';
// --- Configuration ---
const BASE_URL = 'http://192.168.1.93'; // Your application's base URL
const LOGIN_URL = `${BASE_URL}/login`;
const HOME_URL = `${BASE_URL}/`;
const PROFILE_URL = `${BASE_URL}/profile`; // Assuming this is a protected route
const SEARCH_URL = `${BASE_URL}/search`; // Assuming this is the search route
const ADMIN_USERS_URL = `${BASE_URL}/admin/users`;
const ADMIN_NEW_USER_URL = `${ADMIN_USERS_URL}/new`;
const VALID_USER = 'root@localhost';
const VALID_PASS = 'admin'; // Replace with actual valid password if different
const LABS_URL = `${BASE_URL}/labs`;
const INVALID_USER = 'invalid@localhost';
const INVALID_PASS = 'wrongpassword';

const metricsServerUrl = 'http://localhost:3001/report-test'; // URL of your metrics reporting server




// ---  Tests de authentification---

test('Refus de connexion avec des identifiants invalides', async ({ page }) => {
  await page.goto(LOGIN_URL);

  // Tentative de connexion avec de mauvais identifiants
  await page.getByPlaceholder('user@domain.com').fill(INVALID_USER);
  await page.getByPlaceholder('*********').fill(INVALID_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Vérifier que l'utilisateur reste sur la page de connexion
  await expect(page).toHaveURL(LOGIN_URL);
});

test('Connexion réussie', async ({ page }) => {
    await page.goto(LOGIN_URL);

    await page.getByPlaceholder('user@domain.com').fill(VALID_USER);
    await page.getByPlaceholder('*********').fill(VALID_PASS);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Vérifier la redirection vers la page d'accueil/dashboard
    await expect(page).toHaveURL(HOME_URL);
    // Vérifier qu'un élément de la page d'accueil est visible (ex: l'image de profil dans la navbar)
    await expect(page.locator('nav').getByAltText('profile-img')).toBeVisible();
    // Or check for the welcome message
    await expect(page.getByRole('heading', { name: /Hello, .*./ })).toBeVisible(); 
});


test('Déconnexion réussie', async ({ page }) => {
  // --- Connexion ---
  await page.goto(LOGIN_URL);
  await page.getByPlaceholder('user@domain.com').fill(VALID_USER);
  await page.getByPlaceholder('*********').fill(VALID_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Attendre que la page après connexion soit chargée (vérifier l'image profil)
  await expect(page.locator('nav').getByAltText('profile-img')).toBeVisible({ timeout: 10000 }); // Increased timeout just in case

  // --- Déconnexion ---
  // Cliquer sur l'image de profil dans la barre de navigation pour ouvrir le menu
  await page.locator('nav').getByAltText('profile-img').click(); // More specific selector targeting the navbar image
  // Cliquer sur le lien de déconnexion
  await page.getByRole('link', { name: 'Sign out' }).click();

  // --- Vérification ---
  // Vérifier que l'utilisateur est redirigé vers la page de connexion
  await expect(page).toHaveURL(LOGIN_URL);
  // Vérifier que le bouton "Sign in" est à nouveau visible
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('Accès refusé après déconnexion', async ({ page }) => {
  // --- Connexion ---
  await page.goto(LOGIN_URL);
  await page.getByPlaceholder('user@domain.com').fill(VALID_USER);
  await page.getByPlaceholder('*********').fill(VALID_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('nav').getByAltText('profile-img')).toBeVisible({ timeout: 10000 });

  // --- Déconnexion ---
  await page.locator('nav').getByAltText('profile-img').click();
  await page.getByRole('link', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(LOGIN_URL); // Wait for logout redirect

  // --- Tentative d’accès ---
  await page.goto(HOME_URL); // Tentative d’accès direct à la page d’accueil protégée

  // --- Vérification ---
  // Vérifier la redirection vers la page de connexion
  await expect(page).toHaveURL(LOGIN_URL);
});

test('Expiration de session', async ({ page }) => {
  // --- Connexion ---
  await page.goto(LOGIN_URL);
  await page.getByPlaceholder('user@domain.com').fill(VALID_USER);
  await page.getByPlaceholder('*********').fill(VALID_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('nav').getByAltText('profile-img')).toBeVisible({ timeout: 10000 });

  // --- Simuler l’expiration ---
  const context = page.context();
  await context.clearCookies();

  // --- Tentative d’accès ---
  // Recharger la page actuelle ou naviguer vers une page protégée
  await page.reload(); 
  // Ou naviguer vers une page spécifique: await page.goto(PROFILE_URL);

  // --- Vérification ---
  // Vérifier la redirection vers la page de connexion
  await expect(page).toHaveURL(LOGIN_URL);
});

// --- Security Tests ---

test('Détection des failles XSS : injection via paramètre URL (si applicable)', async ({ page }) => {
  const maliciousPayload = "<script>alert('XSS_TEST');</script>";
  const targetUrl = `${SEARCH_URL}?query=${encodeURIComponent(maliciousPayload)}`; 

  let alertTriggered = false;
  page.on('dialog', async dialog => {
    console.log('Dialog message:', dialog.message()); 
    if (dialog.message().includes('XSS_TEST')) {
        alertTriggered = true;
    }
    await dialog.dismiss(); // Dismiss dialog pour ne pas bloquer le test
  });
  // Naviguer sur la page potentiellement vulnérable
  await page.goto(targetUrl);
  // Attendre un peu pour laisser le temps à un éventuel script de s'exécuter
  await page.waitForTimeout(1500);
  // Vérifier qu'aucune alerte spécifique n'a été déclenchée
  expect(alertTriggered, "Une alerte XSS a été déclenchée via l'URL").toBe(false);
});


test('Détection des failles SQL : injection via formulaire de connexion', async ({ page }) => {
  await page.goto(LOGIN_URL);

  // Tentative d’injection SQL simple
  const sqlPayload = "' OR '1'='1";
  await page.getByPlaceholder('user@domain.com').fill(sqlPayload);
  await page.getByPlaceholder('*********').fill(sqlPayload); // Ou un mot de passe quelconque
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Vérifier que l'utilisateur reste sur la page de connexion (échec de connexion attendu)
  // Une injection réussie pourrait rediriger vers HOME_URL ou causer une erreur serveur.
  await expect(page).toHaveURL(LOGIN_URL);

});

// --- Test Admin ---
test('Création étudiant', async ({ page }) => {
  await page.goto(LOGIN_URL);
  await page.getByPlaceholder('user@domain.com').fill(VALID_USER);
  await page.getByPlaceholder('*********').fill(VALID_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('nav').getByAltText('profile-img')).toBeVisible({ timeout: 10000 });
  await page.getByRole('link', { name: 'Admin area' }).click();
  await expect(page).toHaveURL(ADMIN_USERS_URL);
  await expect(page.getByRole('link', { name: 'New user' })).toBeVisible();
  await page.getByRole('link', { name: 'New user' }).click();
  await expect(page).toHaveURL(ADMIN_NEW_USER_URL);
  await expect(page.getByLabel('Email')).toBeVisible();
  const timestamp = Date.now();
  const newUserEmail = `student_${timestamp}@testdomain.com`;
  const newUserPassword = `Password${timestamp}`; // Simple password
  const newUserLastName = 'Test';
  const newUserFirstName = `Student${timestamp}`;

  await page.getByLabel('Email').fill(newUserEmail);
  await page.locator('#user_password').fill(newUserPassword);
  await page.getByLabel('Confirm password').fill(newUserPassword);
  await page.getByLabel('Last name').fill(newUserLastName);
  await page.getByLabel('First name').fill(newUserFirstName);
  await page.getByLabel('Student', { exact: true }).check();
  await expect(page.getByLabel('Enabled')).toBeChecked();
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page).toHaveURL(ADMIN_USERS_URL);
  const successMessageLocator = page.locator('.flash-notice.alert-success');
  await expect(successMessageLocator).toBeVisible({ timeout: 10000 }); // Wait for message
  await expect(successMessageLocator).toContainText('User has been created.');
});

test('Suppression utilisateur', async ({ page }) => {
  await page.goto(LOGIN_URL);
  await page.getByPlaceholder('user@domain.com').fill(VALID_USER);
  await page.getByPlaceholder('*********').fill(VALID_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('nav').getByAltText('profile-img')).toBeVisible({ timeout: 10000 });
  await page.getByRole('link', { name: 'Admin area' }).click();
  await expect(page).toHaveURL(ADMIN_USERS_URL);
  await expect(page.getByRole('link', { name: 'New user' })).toBeVisible();
  await page.getByRole('link', { name: 'New user' }).click();
  await expect(page).toHaveURL(ADMIN_NEW_USER_URL);
  await expect(page.getByLabel('Email')).toBeVisible();
  const timestamp = Date.now();
  const newUserEmail = `student_${timestamp}@testdomain.com`;
  const newUserPassword = `Password${timestamp}`; // Simple password
  const newUserLastName = 'Test';
  const newUserFirstName = `Student${timestamp}`;

  await page.getByLabel('Email').fill(newUserEmail);
  await page.locator('#user_password').fill(newUserPassword);//student_1743269690962@testdomain.com Password1743269690962
  await page.getByLabel('Confirm password').fill(newUserPassword);
  await page.getByLabel('Last name').fill(newUserLastName);
  await page.getByLabel('First name').fill(newUserFirstName);
  await page.getByLabel('Student', { exact: true }).check();
  await expect(page.getByLabel('Enabled')).toBeChecked();
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page).toHaveURL(ADMIN_USERS_URL);
  const successMessageLocator = page.locator('.flash-notice.alert-success');
  await expect(successMessageLocator).toBeVisible({ timeout: 10000 }); // Wait for message
  await expect(successMessageLocator).toContainText('User has been created.');
  const userLink = page.getByRole('link', { name: `${newUserFirstName} ${newUserLastName}` });
  await expect(userLink).toBeVisible({ timeout: 5000 });
  const userRow = page.locator('tr', { has: userLink });
  await userRow.locator('.fa-user-cog').click();
  await expect(page.locator('.dropdown-menu-right.show')).toBeVisible();
  await page.locator('.dropdown-menu-right.show button.btn.btn-danger', { hasText: 'Delete' }).click();


  const visibleDeleteModalContent = page.locator('.modal.show .modal-content', { hasText: 'Delete user' });
  await expect(visibleDeleteModalContent).toBeVisible({ timeout: 10000 });

    // Cliquer sur le bouton Delete DANS la modale visible
  await visibleDeleteModalContent.getByRole('link', { name: 'Yes' }).click();

  await expect(page).toHaveURL(ADMIN_USERS_URL);
  const deleteSuccessMessage = page.locator('.flash-notice.alert-success');
  await expect(deleteSuccessMessage).toBeVisible({ timeout: 10000 });
  await expect(deleteSuccessMessage).toContainText(`${newUserFirstName} ${newUserLastName}'s account has been deleted.`);
  await expect(userLink).not.toBeVisible({ timeout: 5000 });

});


test('Permission et accès interdit au points sensibles', async ({ page }) => {
  await page.goto(LOGIN_URL);
  await page.getByPlaceholder('user@domain.com').fill(VALID_USER);
  await page.getByPlaceholder('*********').fill(VALID_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('nav').getByAltText('profile-img')).toBeVisible({ timeout: 10000 });
  await page.getByRole('link', { name: 'Admin area' }).click();
  await expect(page).toHaveURL(ADMIN_USERS_URL);
  await expect(page.getByRole('link', { name: 'New user' })).toBeVisible();
  await page.getByRole('link', { name: 'New user' }).click();
  await expect(page).toHaveURL(ADMIN_NEW_USER_URL);
  await expect(page.getByLabel('Email')).toBeVisible();
  const timestamp = Date.now();
  const newUserEmail = `student_${timestamp}@testdomain.com`;
  const newUserPassword = `Password${timestamp}`; // Simple password
  const newUserLastName = 'Test';
  const newUserFirstName = `Student${timestamp}`;

  await page.getByLabel('Email').fill(newUserEmail);
  await page.locator('#user_password').fill(newUserPassword);//student_1743269690962@testdomain.com Password1743269690962
  await page.getByLabel('Confirm password').fill(newUserPassword);
  await page.getByLabel('Last name').fill(newUserLastName);
  await page.getByLabel('First name').fill(newUserFirstName);
  await page.getByLabel('Student', { exact: true }).check();
  await expect(page.getByLabel('Enabled')).toBeChecked();
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page).toHaveURL(ADMIN_USERS_URL);
  // --- Déconnexion ---
  // Cliquer sur l'image de profil dans la barre de navigation pour ouvrir le menu
  await page.locator('nav').getByAltText('profile-img').click(); // More specific selector targeting the navbar image
  // Cliquer sur le lien de déconnexion
  await page.getByRole('link', { name: 'Sign out' }).click();

  // --- Vérification ---
  // Vérifier que l'utilisateur est redirigé vers la page de connexion
  await expect(page).toHaveURL(LOGIN_URL);
  // Vérifier que le bouton "Sign in" est à nouveau visible
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  // --- Connexion ---
  await page.goto(LOGIN_URL);
  await page.getByPlaceholder('user@domain.com').fill(newUserEmail);
  await page.getByPlaceholder('*********').fill(newUserPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('nav').getByAltText('profile-img')).toBeVisible({ timeout: 10000 });
  console.log('Vérification absence lien Admin area...');
  await expect(page.getByRole('link', { name: 'Admin area' })).not.toBeVisible();
  console.log('Lien Admin area non visible : OK');
  console.log(`Tentative accès direct à ${ADMIN_USERS_URL}...`);
  await page.goto(ADMIN_USERS_URL);
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(HOME_URL);
  console.log('Accès direct Admin Area bloqué : OK');
  console.log(`Tentative accès direct à ${LABS_URL}...`);
  await page.goto(LABS_URL);
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(HOME_URL);
  console.log('Accès direct Labs redirigé vers Accueil : OK');

});

test('Création et vérification d\'un Virtual Lab', async ({ page }) => {
  await page.goto(LOGIN_URL);
  await page.getByPlaceholder('user@domain.com').fill(VALID_USER);
  await page.getByPlaceholder('*********').fill(VALID_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('nav').getByAltText('profile-img')).toBeVisible({ timeout: 10000 });
  // 2. Aller à la page des Labs
  console.log(`Navigation vers ${LABS_URL}...`);
  await page.goto(LABS_URL);
  await expect(page).toHaveURL(LABS_URL);
  console.log('Page des Labs atteinte.');

  // 3. Cliquer sur "New Virtual Lab"
  console.log('Clic sur le bouton "New Virtual Lab"...');
  const newLabButton = page.locator('a.btn.btn-success[href="/labs/new"]');
  // Ou utiliser le rôle si le texte est fiable :

  await expect(newLabButton).toBeVisible();
  await newLabButton.click();
  console.log('Bouton cliqué.');

  // 4. Vérifier qu'on est sur la page d'édition (URL contient /admin/labs/ et /edit)
  console.log('Vérification de l\'URL de la page d\'édition...');
  // Utilisation d'une expression régulière pour matcher l'URL sans se soucier de l'ID
  // Elle vérifie que l'URL contient /admin/labs/, suivi de chiffres (\d+), et se termine par /edit
  await expect(page).toHaveURL(/.*\/admin\/labs\/\d+\/edit/, { timeout: 15000 }); // Augmentation timeout si la création prend du temps
  console.log('Page d\'édition atteinte.');

  // 5. Retourner à la page des Labs via l'URL
  console.log(`Retour vers ${LABS_URL}...`);
  await page.goto(LABS_URL);
  await expect(page).toHaveURL(LABS_URL);
  console.log('Retour à la page des Labs effectué.');

  // 6. Vérifier que le lab "Untitled Lab" est présent
  console.log('Vérification de la présence du nouveau lab "Untitled Lab"...');
  // Cibler le lien avec la classe 'lab-item-name' et le texte 'Untitled Lab'
  const newLabLink = page.locator('a.lab-item-name', { hasText: 'Untitled Lab' });
  await expect(newLabLink).toBeVisible({ timeout: 40000 }); // Attendre un peu si la liste met du temps à se rafraîchir
  console.log('Nouveau lab "Untitled Lab" trouvé dans la liste.');
});


test.afterEach(async ({}, testInfo) => {
    console.log(`Test finished: ${testInfo.title} - Status: ${testInfo.status} - Duration: ${testInfo.duration}ms`);

    const reportData = {
        status: testInfo.status, // 'passed', 'failed', 'timedOut', 'skipped'
        duration: testInfo.duration, // duration in millisecon
    };

    

    try {
        await axios.post(metricsServerUrl, reportData, { timeout: 5000 });
        console.log(`Sent report for "${testInfo.title}" to metrics server.`);
    } catch (error) {
        console.error(`Failed to send report for "${testInfo.title}" to ${metricsServerUrl}:`, error.message);
        // Ne pas faire échouer le build si le reporting échoue
    }
});
