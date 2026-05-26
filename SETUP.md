# School Map — מדריך הגדרה

## 1. הגדר Firebase Project

1. כנס ל-https://console.firebase.google.com
2. צור פרויקט חדש → שם: `school-map`
3. **Authentication** → Sign-in methods → Phone → Enable
4. **Firestore Database** → Create database → Start in production mode
5. **Storage** → Get started
6. **Project settings** → Your apps → Add app → Web (</>) → Register app
7. העתק את ה-`firebaseConfig` ל-`services/firebase.ts` (החלף את ה-`YOUR_...` placeholders)

## 2. Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User can read/write only their own doc
    match /users/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == uid;
    }
    // Friendships: only participants can read/write
    match /friendships/{id} {
      allow read, write: if request.auth.uid in resource.data.users
        || request.auth.uid in request.resource.data.users;
    }
    // Teachers: any authenticated user
    match /teachers/{id} {
      allow read, write: if request.auth != null;
    }
    // Messages: only conversation participants
    match /messages/{convId}/msgs/{msgId} {
      allow read, write: if request.auth != null &&
        (convId.matches(request.auth.uid + '_.*') ||
         convId.matches('.*_' + request.auth.uid));
    }
    // Sticker requests
    match /stickerRequests/{id} {
      allow create: if request.auth != null;
      allow read: if request.auth.uid == resource.data.to;
    }
  }
}
```

## 3. Storage Security Rules

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /avatars/{uid}.jpg {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == uid;
    }
    match /stickers/{filename} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

## 4. הפעל את האפליקציה

```bash
npm start
```

ואז:
- לחץ `a` לאמולטור Android
- לחץ `i` לסימולטור iOS (macOS בלבד)
- לחץ `w` לדפדפן (לבדיקה)

## 5. פרסום ב-App Store / Google Play

```bash
npm install -g eas-cli
eas login
eas build --platform android   # APK לבדיקה / AAB לפלייסטור
eas build --platform ios       # IPA לאפסטור (דורש Mac + Apple Developer account)
```
