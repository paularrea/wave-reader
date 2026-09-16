# User Stories - Wave Reader

## Epic 1: Map Discovery & Navigation
| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| US.1 | As a surfer, I want the app to open at my current location so I can quickly find nearby spots. | - App requests geolocation permission.<br>- Map centers on user coordinates on load. | Must |
| US.2 | As a surfer, I want to see surf spots as markers on the map with their current star rating based on my skill level. | - Markers show a clear star score (0-10).<br>- Rating changes if I change my skill level in the profile. | Must |
| US.3 | As a surfer, I want to pan and zoom the map interactively to explore other regions. | - Map responds smoothly to touch/drag gestures.<br>- Zoom levels maintain performance. | Must |

## Epic 2: Forecasting & Visualization
| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| US.4 | As a surfer, I want to use a time slider to see how the stars and conditions change over the next few days. | - Slider allows selection of specific hours/days.<br>- Map markers and flows update instantly when the slider moves. | Must |
| US.5 | As a surfer, I want to see animated wind/swell flows to understand the energy of the ocean. | - Particles move in the direction of wind/swell.<br>- Color changes based on intensity. | Should |
| US.6 | As a surfer, I want to toggle between wind flow and swell flow. | - Switch available in the UI.<br>- Layers are added/removed without reloading the map. | Should |

## Epic 3: Spot Intelligence & Action
| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| US.7 | As a surfer, I want to tap a spot to see detailed data (Height, Period, Wind) and its suitability for my level. | - Bottom drawer opens on tap.<br>- Data is formatted for quick reading (e.g., "1.5m @ 10s"). | Must |
| US.8 | As a surfer, I want to launch Google Maps from the spot detail to navigate to the beach. | - Button "Go to Spot" exists in the drawer.<br>- Opens external Google Maps app with destination set. | Must |

## Epic 4: User Personalization
| ID | User Story | Acceptance Criteria | Priority |
| :--- | :--- | :--- | :--- |
| US.9 | As a surfer, I want to set my skill level (Beginner, Intermediate, Expert) so that the app ranks spots according to my abilities. | - Profile setting for skill level.<br>- The Star Engine recalculates ratings based on the chosen level. | Must |
